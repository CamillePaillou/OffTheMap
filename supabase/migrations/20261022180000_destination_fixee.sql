-- Destination fixée après l'entretien, nuits calculées depuis les dates fixes (retours du 22/10).
--
-- 1. fiches.destination_fixe : le client n'a pas forcément donné de destination, ou en change pendant l'entretien.
--    Écrite par corriger_fiche, comme le budget réel et les dates fixes : une régénération ne la touche pas.
-- 2. corriger_fiche ne reçoit plus le nombre de nuits : nb_nuits_fixe est calculé depuis les dates fixes
--    (retour − départ), null tant que l'une manque. Même règle que la demande (nuitsEntre).
-- 3. Destination du dossier = destination fixée, sinon celle de la demande. Sans elle :
--    - demarrer_brouillon refuse (OT015) : le catalogue mélangerait toutes les villes ;
--    - envoyer_proposition refuse (OT009), comme pour une ligne ou une alerte bloquante.

alter table fiches add column destination_fixe text
  check (destination_fixe is null or char_length(btrim(destination_fixe)) between 1 and 120);

drop function corriger_fiche(uuid, integer, date, date, integer, text);
create function corriger_fiche(
  p_fiche_id uuid,
  p_budget_reel_cents integer,
  p_date_debut_fixe date,
  p_date_fin_fixe date,
  p_notes_conseiller text,
  p_destination_fixe text default null
) returns void
language plpgsql set search_path = public as $$
begin
  update fiches set
    budget_reel_cents = p_budget_reel_cents,
    destination_fixe = nullif(btrim(p_destination_fixe), ''),
    date_debut_fixe = p_date_debut_fixe,
    date_fin_fixe = p_date_fin_fixe,
    nb_nuits_fixe = p_date_fin_fixe - p_date_debut_fixe,  -- null si une date manque
    notes_conseiller = p_notes_conseiller
  where id = p_fiche_id;
  if not found then
    raise exception 'fiche introuvable : %', p_fiche_id using errcode = 'OT001';
  end if;
end $$;

-- destination fixée, sinon celle de la demande courante ; null si aucune
create function destination_dossier(p_dossier uuid)
returns text
language sql stable set search_path = public as $$
  select coalesce(nullif(btrim(f.destination_fixe), ''), nullif(btrim(d.destination), ''))
  from demandes d left join fiches f on f.demande_id = d.id
  where d.dossier_id = p_dossier and d.remplacee_le is null
  order by d.version desc
  limit 1
$$;

create or replace function demarrer_brouillon(p_dossier uuid, p_conseiller uuid)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_statut statut_dossier;
  v_fiche fiches%rowtype;
  v_proposition uuid;
  v_version integer;
begin
  select statut into v_statut from dossiers where id = p_dossier for update;
  if not found then
    raise exception 'dossier introuvable : %', p_dossier using errcode = 'OT001';
  end if;
  if destination_dossier(p_dossier) is null then
    raise exception 'aucune destination : la fixer sur la fiche avant le brouillon' using errcode = 'OT015';
  end if;

  if v_statut = 'entretien_fait' then
    select f.* into v_fiche from fiches f join demandes d on d.id = f.demande_id
      where d.dossier_id = p_dossier and d.remplacee_le is null;
    if v_fiche.id is null or v_fiche.budget_reel_cents is null or v_fiche.date_debut_fixe is null or v_fiche.date_fin_fixe is null then
      raise exception 'fiche incomplète : budget réel et dates fixes requis' using errcode = 'OT005';
    end if;
    if v_fiche.validee_par is null then
      update fiches set validee_par = p_conseiller, validee_le = now() where id = v_fiche.id;
    end if;
    perform changer_statut('dossier', p_dossier, 'entretien_fait', 'en_proposition', 'conseiller', p_conseiller,
      jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'entretien_fait', 'nouveau', 'en_proposition'));
    v_statut := 'en_proposition';
  end if;

  if v_statut <> 'en_proposition' then
    raise exception 'statut modifié entre-temps : attendu en_proposition, trouvé %', v_statut using errcode = 'OT002';
  end if;
  if exists (select 1 from propositions where dossier_id = p_dossier) then
    raise exception 'le dossier % a déjà une proposition', p_dossier using errcode = 'OT004';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from propositions where dossier_id = p_dossier;
  insert into propositions (dossier_id, version, statut) values (p_dossier, v_version, 'brouillon_en_cours')
    returning id into v_proposition;
  insert into historique_dossier (dossier_id, proposition_id, type, ancien_statut, nouveau_statut, auteur, detail)
    values (p_dossier, v_proposition, 'statut', null, 'brouillon_en_cours', 'systeme',
            jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', null, 'nouveau', 'brouillon_en_cours'));
  return v_proposition;
end $$;

create or replace function envoyer_proposition(p_proposition uuid, p_conseiller uuid)
returns bigint
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_bloquees integer;
  v_alertes integer;
  v_historique bigint;
begin
  select statut, dossier_id into v_statut, v_dossier from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if destination_dossier(v_dossier) is null then
    raise exception 'envoi refusé : aucune destination fixée' using errcode = 'OT009';
  end if;

  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = p_proposition and statut in ('a_verifier', 'indisponible');
  select count(*) into v_alertes from propositions p, jsonb_array_elements(p.alertes) a
    where p.id = p_proposition
      and a ->> 'code' in ('capacite_depassee', 'participants_superieurs_voyageurs', 'date_hors_sejour', 'prestation_inactive');
  if v_bloquees > 0 or v_alertes > 0 then
    raise exception 'envoi refusé : % ligne(s) à vérifier ou indisponible(s), % alerte(s) bloquante(s)', v_bloquees, v_alertes
      using errcode = 'OT009';
  end if;

  -- prete → envoyee par la fonction de transition : refusée (OT002) depuis tout autre statut
  v_historique := changer_statut('proposition', p_proposition, 'prete', 'envoyee', 'conseiller', p_conseiller,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'prete', 'nouveau', 'envoyee'));
  update propositions set envoyee_le = now(), envoyee_par = p_conseiller where id = p_proposition;
  return v_historique;
end $$;

revoke execute on function corriger_fiche(uuid, integer, date, date, text, text) from public, anon, authenticated;
grant execute on function corriger_fiche(uuid, integer, date, date, text, text) to service_role;
revoke execute on function destination_dossier(uuid) from public, anon, authenticated;
grant execute on function destination_dossier(uuid) to service_role;
