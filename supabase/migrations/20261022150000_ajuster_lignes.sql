-- Ajuster les lignes d'une proposition modifiable (E6.6) : refléter le changement demandé par le client
-- (« deux nuits au lieu d'une ») sans tout régénérer. Même schéma que remplacer_ligne (E5.2).
--
-- ajouter_ligne : nouvelle ligne « a_verifier » pour une prestation du catalogue, à une date et pour un nombre de
-- participants donnés, au prix du catalogue (copie figée, comme à la création par le brouillon).
-- modifier_ligne : nouvelle date et/ou nouveaux participants pour une ligne ; elle repasse « a_verifier » sans prix
-- confirmé (le tarif obtenu ne vaut plus pour une autre date ou un autre groupe). Prix catalogue inchangé : même prestation.
-- Les autres lignes, et leurs tarifs confirmés, ne sont pas touchées.
--
-- Comme changer_ligne (E5.1) et remplacer_ligne (E5.2) : proposition verrouillée, figée une fois envoyée (OT008),
-- ligne modifiée entre-temps ou déjà remplacée (OT002), total recalculé, statut de la proposition qui suit
-- (a_verifier ↔ prete, journal compris). Refus : prestation inconnue ou retirée (OT010) ; la même prestation existe déjà
-- à cette date, ou rien ne change (OT011) ; participants hors de 1 à 20 (contrainte de la table).
-- Réservées au serveur (service_role).

-- total et statut de la proposition après un changement de ses lignes (même règle que remplacer_ligne)
create function suivre_proposition(p_proposition uuid, p_statut statut_proposition)
returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_bloquees integer;
  v_cible statut_proposition;
begin
  update propositions set total_cents = (
    select coalesce(sum(total_ligne_cents), 0) from proposition_lignes
    where proposition_id = p_proposition and statut not in ('remplacee', 'indisponible')
  ) where id = p_proposition;

  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = p_proposition and statut in ('a_verifier', 'indisponible');
  v_cible := case when v_bloquees = 0 then 'prete' else 'a_verifier' end;
  if v_cible <> p_statut then
    perform changer_statut('proposition', p_proposition, p_statut::text, v_cible::text, 'systeme', null,
      jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', p_statut, 'nouveau', v_cible));
  end if;
  return v_cible;
end $$;

create function ajouter_ligne(
  p_proposition uuid,
  p_prestation text,
  p_date date,
  p_participants integer,
  p_conseiller uuid
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_prix integer;
  v_nouvelle uuid;
begin
  if p_conseiller is null then
    raise exception 'ajout sans conseiller identifié' using errcode = 'OT003';
  end if;
  select statut into v_statut from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select prix_unitaire_cents into v_prix from prestations where id = p_prestation and actif;
  if v_prix is null then
    raise exception 'prestation inconnue ou retirée du catalogue : %', p_prestation using errcode = 'OT010';
  end if;
  if exists (select 1 from proposition_lignes where proposition_id = p_proposition and prestation_id = p_prestation
             and date = p_date and statut not in ('remplacee', 'indisponible')) then
    raise exception 'la prestation % est déjà prévue le %', p_prestation, p_date using errcode = 'OT011';
  end if;

  insert into proposition_lignes (proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
    values (p_proposition, p_prestation, p_date, p_participants, v_prix)
    returning id into v_nouvelle;
  perform suivre_proposition(p_proposition, v_statut);
  return v_nouvelle;
end $$;

create function modifier_ligne(
  p_ligne uuid,
  p_conseiller uuid,
  p_date date default null,
  p_participants integer default null
) returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ligne proposition_lignes%rowtype;
  v_date date;
  v_participants integer;
begin
  if p_conseiller is null then
    raise exception 'modification sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select * into v_ligne from proposition_lignes where id = p_ligne for update;
  if v_ligne.statut not in ('a_verifier', 'confirme', 'indisponible') then
    raise exception 'ligne au statut %, elle ne se modifie plus', v_ligne.statut using errcode = 'OT002';
  end if;
  v_date := coalesce(p_date, v_ligne.date);
  v_participants := coalesce(p_participants, v_ligne.participants);
  if v_date = v_ligne.date and v_participants = v_ligne.participants then
    raise exception 'rien ne change : même date et mêmes participants' using errcode = 'OT011';
  end if;
  if v_date <> v_ligne.date and exists (
    select 1 from proposition_lignes where proposition_id = v_proposition and prestation_id = v_ligne.prestation_id
      and date = v_date and id <> p_ligne and statut not in ('remplacee', 'indisponible')) then
    raise exception 'la prestation % est déjà prévue le %', v_ligne.prestation_id, v_date using errcode = 'OT011';
  end if;

  -- à vérifier, sans prix confirmé : le tarif obtenu ne vaut plus pour une autre date ou un autre groupe
  update proposition_lignes set
    date = v_date, participants = v_participants, statut = 'a_verifier',
    prix_confirme_cents = null, source = null, confirme_le = null, confirme_par = null
  where id = p_ligne;
  return suivre_proposition(v_proposition, v_statut);
end $$;

-- ajuster_nuits_sejour : boutons « − » et « + » du séjour sur la page de la proposition. Recule ou avance la date de
-- retour d'un jour et ajoute ou retire une nuit, dans les dates fixes de la fiche (E2.1) ; sans dates fixes, on part
-- des dates de la demande. Le budget réel et les notes ne sont pas touchés. Refus : proposition figée (OT008), fiche
-- absente (OT001), nuits hors de 0 à 14 ou plus de nuits que de jours (OT012). Renvoie le séjour obtenu.
create function ajuster_nuits_sejour(p_proposition uuid, p_delta integer, p_conseiller uuid)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_fiche uuid;
  v_debut date;
  v_fin date;
  v_nuits integer;
begin
  if p_conseiller is null then
    raise exception 'séjour ajusté sans conseiller identifié' using errcode = 'OT003';
  end if;
  if p_delta not in (-1, 1) then
    raise exception 'le séjour s''ajuste d''une nuit à la fois' using errcode = 'OT012';
  end if;
  select statut, dossier_id into v_statut, v_dossier from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, le séjour ne se modifie plus ici', v_statut using errcode = 'OT008';
  end if;

  select f.id, coalesce(f.date_debut_fixe, d.date_debut), coalesce(f.date_fin_fixe, d.date_fin), coalesce(f.nb_nuits_fixe, d.nb_nuits)
    into v_fiche, v_debut, v_fin, v_nuits
    from demandes d join fiches f on f.demande_id = d.id
    where d.dossier_id = v_dossier and d.remplacee_le is null
    for update of f;
  if v_fiche is null then
    raise exception 'aucune fiche pour le dossier %', v_dossier using errcode = 'OT001';
  end if;

  v_fin := v_fin + p_delta;
  v_nuits := v_nuits + p_delta;
  if v_nuits < 0 or v_nuits > 14 or v_fin < v_debut or v_nuits > v_fin - v_debut then
    raise exception 'séjour impossible : % nuit(s) du % au %', v_nuits, v_debut, v_fin using errcode = 'OT012';
  end if;

  update fiches set date_debut_fixe = v_debut, date_fin_fixe = v_fin, nb_nuits_fixe = v_nuits where id = v_fiche;
  return jsonb_build_object('date_debut', v_debut, 'date_fin', v_fin, 'nb_nuits', v_nuits);
end $$;

-- modifier_budget_reel : « Modifier » le budget sur la page de la proposition, quand le client accepte de payer plus
-- (ou moins). Écrit seulement fiches.budget_reel_cents (E2.1) : dates fixes et notes intactes. Refus : proposition figée
-- (OT008), fiche absente (OT001), budget nul ou négatif (contrainte de la table).
create function modifier_budget_reel(p_proposition uuid, p_budget_cents integer, p_conseiller uuid)
returns void
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_fiche uuid;
begin
  if p_conseiller is null then
    raise exception 'budget modifié sans conseiller identifié' using errcode = 'OT003';
  end if;
  select statut, dossier_id into v_statut, v_dossier from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, le budget ne se modifie plus ici', v_statut using errcode = 'OT008';
  end if;
  update fiches f set budget_reel_cents = p_budget_cents
    from demandes d
    where f.demande_id = d.id and d.dossier_id = v_dossier and d.remplacee_le is null
    returning f.id into v_fiche;
  if v_fiche is null then
    raise exception 'aucune fiche pour le dossier %', v_dossier using errcode = 'OT001';
  end if;
end $$;

revoke execute on function modifier_budget_reel(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function modifier_budget_reel(uuid, integer, uuid) to service_role;
revoke execute on function ajuster_nuits_sejour(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function ajuster_nuits_sejour(uuid, integer, uuid) to service_role;
revoke execute on function suivre_proposition(uuid, statut_proposition) from public, anon, authenticated;
grant execute on function suivre_proposition(uuid, statut_proposition) to service_role;
revoke execute on function ajouter_ligne(uuid, text, date, integer, uuid) from public, anon, authenticated;
grant execute on function ajouter_ligne(uuid, text, date, integer, uuid) to service_role;
revoke execute on function modifier_ligne(uuid, uuid, date, integer) from public, anon, authenticated;
grant execute on function modifier_ligne(uuid, uuid, date, integer) to service_role;
