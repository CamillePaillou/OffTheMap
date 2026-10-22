-- Prestation devenue indisponible après le dépôt (E7.4). Jusqu'ici, une proposition acceptée ne permettait plus
-- de toucher une ligne : une prestation complète bloquait la réservation pour de bon.
-- Sur une proposition au dépôt reçu, pour une ligne pas encore réservée, le conseiller peut désormais :
--   1. la marquer indisponible (confirme ou a_verifier → indisponible), par changer_ligne ;
--   2. la remplacer (remplacer_ligne), ou la retirer sans la remplacer (retirer_ligne), l'accord du client coché :
--      sans lui, OT013. Le changement est journalisé (type « changement ») avec l'ancien et le nouveau prix ;
--   3. confirmer le prix de la ligne de remplacement (a_verifier → confirme), par changer_ligne, puis la réserver
--      comme les autres (accord, option, confirmation).
-- Rien d'autre ne bouge après le dépôt (OT008) : ni retour à vérifier, ni ajout, ni dates ou participants.
-- La proposition reste au dépôt reçu ; elle passe à reservee, et le dossier à gagnee, quand toutes ses lignes
-- comptées sont réservées. Les lignes remplacees, retirees et indisponibles sont hors total.
-- Une ligne retirée ne peut pas être la dernière : il resterait une proposition vide (OT014).
-- Une ligne avec un accord ou une option encore valables ne se marque pas indisponible (OT012).

alter table proposition_lignes drop constraint proposition_lignes_check1;
alter table proposition_lignes add constraint proposition_lignes_prix_si_comptee
  check (statut in ('a_verifier', 'indisponible', 'remplacee', 'retiree') or prix_confirme_cents is not null);

-- total et statut de la proposition après un changement de ses lignes ; au dépôt reçu, la proposition ne repasse
-- jamais à vérifier : elle devient réservée quand sa dernière ligne comptée l'est
create or replace function suivre_proposition(p_proposition uuid, p_statut statut_proposition)
returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_bloquees integer;
  v_cible statut_proposition;
  v_dossier uuid;
begin
  update propositions set total_cents = (
    select coalesce(sum(total_ligne_cents), 0) from proposition_lignes
    where proposition_id = p_proposition and statut not in ('remplacee', 'indisponible', 'retiree')
  ) where id = p_proposition;

  if p_statut = 'depot_recu' then
    if exists (select 1 from proposition_lignes where proposition_id = p_proposition and statut not in ('remplacee', 'retiree'))
       and not exists (select 1 from proposition_lignes where proposition_id = p_proposition
                       and statut not in ('reservee', 'remplacee', 'retiree')) then
      select dossier_id into v_dossier from propositions where id = p_proposition;
      perform changer_statut('proposition', p_proposition, 'depot_recu', 'reservee', 'systeme', null,
        '{"type": "statut", "cible": "proposition", "ancien": "depot_recu", "nouveau": "reservee"}');
      perform changer_statut('dossier', v_dossier, 'en_proposition', 'gagnee', 'systeme', null,
        '{"type": "statut", "cible": "dossier", "ancien": "en_proposition", "nouveau": "gagnee"}');
      return 'reservee';
    end if;
    return 'depot_recu';
  end if;

  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = p_proposition and statut in ('a_verifier', 'indisponible');
  v_cible := case when v_bloquees = 0 then 'prete' else 'a_verifier' end;
  if v_cible <> p_statut then
    perform changer_statut('proposition', p_proposition, p_statut::text, v_cible::text, 'systeme', null,
      jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', p_statut, 'nouveau', v_cible));
  end if;
  return v_cible;
end $$;

-- E5.1, élargie : au dépôt reçu, seulement indisponible (ligne non réservée) et confirmation du prix d'une remplaçante
create or replace function changer_ligne(
  p_ligne uuid,
  p_ancien statut_ligne,
  p_nouveau statut_ligne,
  p_prix_cents integer,
  p_source source_prix,
  p_conseiller uuid
) returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ligne statut_ligne;
begin
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if not (v_statut in ('a_verifier', 'prete')
          or (v_statut = 'depot_recu' and (p_ancien, p_nouveau) in
              (('confirme'::statut_ligne, 'indisponible'::statut_ligne), ('a_verifier', 'indisponible'), ('a_verifier', 'confirme')))) then
    raise exception 'proposition au statut %, ce changement de ligne n''est plus possible', v_statut using errcode = 'OT008';
  end if;
  select statut into v_ligne from proposition_lignes where id = p_ligne for update;
  if v_ligne is distinct from p_ancien then
    raise exception 'ligne modifiée entre-temps : attendu %, trouvé %', p_ancien, v_ligne using errcode = 'OT002';
  end if;
  -- une option encore valable chez le prestataire : la confirmer ou la laisser expirer d'abord
  if p_nouveau = 'indisponible' and exists (select 1 from options where ligne_id = p_ligne
       and (statut = 'posee' and expire_le > now() or statut = 'accord_donne' and not accord_utilise and accord_expire_le > now())) then
    raise exception 'démarche en cours sur la ligne %', p_ligne using errcode = 'OT012';
  end if;

  if p_nouveau = 'confirme' then
    update proposition_lignes
      set statut = 'confirme', prix_confirme_cents = p_prix_cents, source = p_source, confirme_le = now(), confirme_par = p_conseiller
      where id = p_ligne;
  else
    -- à vérifier ou indisponible : l'ancien tarif confirmé ne vaut plus
    update proposition_lignes
      set statut = p_nouveau, prix_confirme_cents = null, source = null, confirme_le = null, confirme_par = null
      where id = p_ligne;
  end if;
  return suivre_proposition(v_proposition, v_statut);
end $$;

-- journal d'un remplacement ou d'un retrait après le dépôt : ce que le client a accepté
create function journaliser_changement_ligne(p_proposition uuid, p_conseiller uuid, p_detail jsonb)
returns void
language sql set search_path = public as $$
  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    select dossier_id, id, 'changement', 'conseiller', p_conseiller, p_detail from propositions where id = p_proposition;
$$;

drop function remplacer_ligne(uuid, text, uuid, date, integer);

-- E5.2, élargie : au dépôt reçu, avec l'accord du client
create function remplacer_ligne(
  p_ligne uuid,
  p_prestation text,
  p_conseiller uuid,
  p_date date default null,
  p_participants integer default null,
  p_accord_client boolean default false
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ancienne proposition_lignes%rowtype;
  v_prix integer;
  v_nouvelle uuid;
  v_participants integer;
begin
  if p_conseiller is null then
    raise exception 'remplacement sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete', 'depot_recu') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  if v_statut = 'depot_recu' and not p_accord_client then
    raise exception 'proposition acceptée : le remplacement demande l''accord du client' using errcode = 'OT013';
  end if;
  select * into v_ancienne from proposition_lignes where id = p_ligne for update;
  if v_ancienne.statut <> 'indisponible' then
    raise exception 'seule une ligne indisponible se remplace : trouvé %', v_ancienne.statut using errcode = 'OT002';
  end if;
  if p_prestation = v_ancienne.prestation_id and coalesce(p_date, v_ancienne.date) = v_ancienne.date then
    raise exception 'même prestation à la même date : choisir une autre prestation ou une autre date' using errcode = 'OT011';
  end if;
  select prix_unitaire_cents into v_prix from prestations where id = p_prestation and actif;
  if v_prix is null then
    raise exception 'prestation inconnue ou retirée du catalogue : %', p_prestation using errcode = 'OT010';
  end if;

  v_participants := coalesce(p_participants, v_ancienne.participants);
  update proposition_lignes set statut = 'remplacee' where id = p_ligne;
  insert into proposition_lignes (proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
    values (v_proposition, p_prestation, coalesce(p_date, v_ancienne.date), v_participants, v_prix)
    returning id into v_nouvelle;

  if v_statut = 'depot_recu' then
    perform journaliser_changement_ligne(v_proposition, p_conseiller, jsonb_build_object('type', 'remplacement',
      'ligne_id', p_ligne, 'nouvelle_ligne_id', v_nouvelle, 'ancienne_prestation', v_ancienne.prestation_id,
      'nouvelle_prestation', p_prestation, 'ancien_total_cents', v_ancienne.total_ligne_cents,
      'nouveau_total_catalogue_cents', v_prix * v_participants, 'accord_client', true));
  end if;
  perform suivre_proposition(v_proposition, v_statut);
  return v_nouvelle;
end $$;

-- retrait sans remplacement, après le dépôt seulement, avec l'accord du client
create function retirer_ligne(p_ligne uuid, p_conseiller uuid, p_accord_client boolean)
returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ancienne proposition_lignes%rowtype;
begin
  if p_conseiller is null then
    raise exception 'retrait sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut <> 'depot_recu' then
    raise exception 'proposition au statut %, une ligne ne se retire qu''après le dépôt', v_statut using errcode = 'OT008';
  end if;
  if not p_accord_client then
    raise exception 'le retrait demande l''accord du client' using errcode = 'OT013';
  end if;
  select * into v_ancienne from proposition_lignes where id = p_ligne for update;
  if v_ancienne.statut <> 'indisponible' then
    raise exception 'seule une ligne indisponible se retire : trouvé %', v_ancienne.statut using errcode = 'OT002';
  end if;
  if not exists (select 1 from proposition_lignes where proposition_id = v_proposition and id <> p_ligne
                 and statut not in ('remplacee', 'retiree', 'indisponible')) then
    raise exception 'dernière prestation de la proposition : elle ne peut pas être retirée' using errcode = 'OT014';
  end if;

  update proposition_lignes set statut = 'retiree' where id = p_ligne;
  perform journaliser_changement_ligne(v_proposition, p_conseiller, jsonb_build_object('type', 'retrait',
    'ligne_id', p_ligne, 'ancienne_prestation', v_ancienne.prestation_id, 'ancien_total_cents', v_ancienne.total_ligne_cents,
    'accord_client', true));
  return suivre_proposition(v_proposition, v_statut);
end $$;

revoke execute on function remplacer_ligne(uuid, text, uuid, date, integer, boolean) from public, anon, authenticated;
revoke execute on function retirer_ligne(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function journaliser_changement_ligne(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function remplacer_ligne(uuid, text, uuid, date, integer, boolean) to service_role;
grant execute on function retirer_ligne(uuid, uuid, boolean) to service_role;
grant execute on function journaliser_changement_ligne(uuid, uuid, jsonb) to service_role;
