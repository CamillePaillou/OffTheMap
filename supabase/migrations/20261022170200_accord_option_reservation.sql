-- Accord, option, réservation et annulation en base (E7.4, branche E9.3 à E9.5 et E9.8 sur PostgreSQL) : jusqu'ici l'écran d'accord
-- gardait ses démarches en mémoire. Chaque écriture et sa ligne de historique_dossier sont faites ensemble.
--   1. enregistrer_accord : options au statut accord_donne, rattachée à la dernière vérification de la ligne.
--      Les démarches périmées de la ligne sont d'abord closes (accord expiré → echec, option expirée → expiree),
--      sinon l'index options_une_en_cours_par_ligne bloquerait un nouvel accord. OT012 si une démarche est en cours.
--   2. consommer_accord : usage unique, avant l'appel au simulateur (null si absent, utilisé ou expiré).
--   3. terminer_pose_option : posee (réponse du simulateur) ou echec.
--   4. terminer_confirmation : confirmee, la ligne passe à reservee ; quand toutes les lignes comptées sont
--      réservées (hors remplacees et retirees), la proposition passe à reservee et le dossier à gagnee, par
--      suivre_proposition (transitions système, types/transitions.ts).
--      Un échec laisse l'option posee : la réponse est conservée et l'échec journalisé.
--   5. terminer_annulation (E9.8, Could) : confirmee → annulee au nom du conseiller, et la ligne repasse à confirme
--      (un nouvel accord redevient possible). Si la proposition était réservée, elle repasse à depot_recu et le
--      dossier de gagnee à en_proposition (transitions système, types/transitions.ts). Un échec laisse tout en l'état.
--   6. tracer_evenement_option : tentatives refusées avant toute écriture externe.
-- La clé d'approbation n'arrive jamais jusqu'ici. Réservées au serveur (service_role).

create function enregistrer_accord(p_ligne uuid, p_conseiller uuid, p_accord_le timestamptz, p_expire_le timestamptz, p_prix_cents integer)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_dossier uuid;
  v_verification uuid;
  v_option uuid;
begin
  select l.proposition_id, p.dossier_id into v_proposition, v_dossier
    from proposition_lignes l join propositions p on p.id = l.proposition_id where l.id = p_ligne for update of l;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select id into v_verification from verifications where ligne_id = p_ligne order by cree_le desc limit 1;
  if v_verification is null then
    raise exception 'aucune vérification pour la ligne %', p_ligne using errcode = 'OT003';
  end if;

  update options set statut = 'echec', accord_utilise = true
    where ligne_id = p_ligne and statut = 'accord_donne' and accord_expire_le <= p_accord_le;
  update options set statut = 'expiree'
    where ligne_id = p_ligne and statut = 'posee' and expire_le <= p_accord_le;

  begin
    insert into options (ligne_id, verification_id, accord_par, accord_le, accord_expire_le, prix_accorde_cents)
      values (p_ligne, v_verification, p_conseiller, p_accord_le, p_expire_le, p_prix_cents)
      returning id into v_option;
  exception when unique_violation then
    raise exception 'démarche déjà en cours sur la ligne %', p_ligne using errcode = 'OT012';
  end;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'accord', 'conseiller', p_conseiller,
      jsonb_build_object('type', 'accord', 'option_id', v_option, 'ligne_id', p_ligne, 'prix_accorde_cents', p_prix_cents));
  return v_option;
end $$;

create function consommer_accord(p_option uuid, p_maintenant timestamptz)
returns boolean
language sql set search_path = public as $$
  with consomme as (
    update options set accord_utilise = true
      where id = p_option and statut = 'accord_donne' and not accord_utilise and accord_expire_le > p_maintenant
      returning id)
  select exists (select 1 from consomme);
$$;

create function terminer_pose_option(p_option uuid, p_ok boolean, p_option_id_simulateur text, p_expire_le timestamptz,
  p_reponse jsonb, p_raison text)
returns void
language plpgsql set search_path = public as $$
declare
  v_ligne uuid;
  v_proposition uuid;
  v_dossier uuid;
begin
  select o.ligne_id, l.proposition_id, p.dossier_id into v_ligne, v_proposition, v_dossier
    from options o join proposition_lignes l on l.id = o.ligne_id join propositions p on p.id = l.proposition_id
    where o.id = p_option and o.statut = 'accord_donne' and o.accord_utilise for update of o;
  if v_ligne is null then
    raise exception 'accord consommé introuvable : %', p_option using errcode = 'OT001';
  end if;

  if p_ok then
    -- le cas d'usage a vérifié que le prix du simulateur est celui accordé : il est figé tel quel
    update options set statut = 'posee', option_id_simulateur = p_option_id_simulateur, prix_option_cents = prix_accorde_cents,
      expire_le = p_expire_le, reponse_option = p_reponse
      where id = p_option;
  else
    update options set statut = 'echec', reponse_option = p_reponse where id = p_option;
  end if;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, detail)
    values (v_dossier, v_proposition, 'option', 'systeme', jsonb_strip_nulls(jsonb_build_object('type', 'option', 'option_id', p_option,
      'ligne_id', v_ligne, 'ok', p_ok, 'option_id_simulateur', p_option_id_simulateur, 'expire_le', p_expire_le, 'raison', p_raison)));
end $$;

create function terminer_confirmation(p_option uuid, p_ok boolean, p_conseiller uuid, p_reservation_id_simulateur text,
  p_reponse jsonb, p_raison text)
returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_ligne uuid;
  v_proposition uuid;
  v_dossier uuid;
  v_statut statut_proposition;
begin
  select o.ligne_id, l.proposition_id, p.dossier_id into v_ligne, v_proposition, v_dossier
    from options o join proposition_lignes l on l.id = o.ligne_id join propositions p on p.id = l.proposition_id
    where o.id = p_option and o.statut = 'posee' for update of o;
  if v_ligne is null then
    raise exception 'option posée introuvable : %', p_option using errcode = 'OT001';
  end if;

  if not p_ok then
    update options set reponse_confirmation = p_reponse where id = p_option;
    insert into historique_dossier (dossier_id, proposition_id, type, auteur, detail)
      values (v_dossier, v_proposition, 'option', 'systeme', jsonb_build_object('type', 'confirmation', 'option_id', p_option,
        'ligne_id', v_ligne, 'ok', false, 'raison', p_raison));
    select statut into v_statut from propositions where id = v_proposition;
    return v_statut;
  end if;

  update options set statut = 'confirmee', confirme_par = p_conseiller, confirme_le = now(),
    reservation_id_simulateur = p_reservation_id_simulateur, reponse_confirmation = p_reponse
    where id = p_option;
  update proposition_lignes set statut = 'reservee' where id = v_ligne and statut = 'confirme';
  if not found then
    raise exception 'la ligne % n''est plus confirmée', v_ligne using errcode = 'OT002';
  end if;
  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'reservation', 'conseiller', p_conseiller, jsonb_build_object('type', 'reservation',
      'option_id', p_option, 'ligne_id', v_ligne, 'reservation_id_simulateur', p_reservation_id_simulateur));

  -- dernière ligne comptée réservée : la proposition est réservée et le dossier gagné (suivre_proposition, migration précédente)
  select statut into v_statut from propositions where id = v_proposition;
  return suivre_proposition(v_proposition, v_statut);
end $$;

alter table options add column reponse_annulation jsonb;

create function terminer_annulation(p_option uuid, p_ok boolean, p_conseiller uuid, p_reponse jsonb, p_raison text)
returns void
language plpgsql set search_path = public as $$
declare
  v_ligne uuid;
  v_proposition uuid;
  v_dossier uuid;
  v_reservation text;
  v_statut statut_proposition;
begin
  select o.ligne_id, l.proposition_id, p.dossier_id, o.reservation_id_simulateur into v_ligne, v_proposition, v_dossier, v_reservation
    from options o join proposition_lignes l on l.id = o.ligne_id join propositions p on p.id = l.proposition_id
    where o.id = p_option and o.statut = 'confirmee' for update of o;
  if v_ligne is null then
    raise exception 'réservation confirmée introuvable : %', p_option using errcode = 'OT001';
  end if;

  if p_ok then
    update options set statut = 'annulee', annulee_le = now(), reponse_annulation = p_reponse where id = p_option;
    update proposition_lignes set statut = 'confirme' where id = v_ligne and statut = 'reservee';
    if not found then
      raise exception 'la ligne % n''est pas réservée', v_ligne using errcode = 'OT002';
    end if;
  else
    update options set reponse_annulation = p_reponse where id = p_option;
  end if;
  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'option', case when p_conseiller is null then 'systeme' else 'conseiller' end::auteur_evenement,
      p_conseiller, jsonb_strip_nulls(jsonb_build_object('type', 'annulation', 'option_id', p_option, 'ligne_id', v_ligne, 'ok', p_ok,
        'reservation_id_simulateur', v_reservation, 'raison', p_raison)));

  -- la proposition n'est plus entièrement réservée : elle et son dossier sont rouverts
  select statut into v_statut from propositions where id = v_proposition;
  if p_ok and v_statut = 'reservee' then
    perform changer_statut('proposition', v_proposition, 'reservee', 'depot_recu', 'systeme', null,
      '{"type": "statut", "cible": "proposition", "ancien": "reservee", "nouveau": "depot_recu"}');
    perform changer_statut('dossier', v_dossier, 'gagnee', 'en_proposition', 'systeme', null,
      '{"type": "statut", "cible": "dossier", "ancien": "gagnee", "nouveau": "en_proposition"}');
  end if;
end $$;

create function tracer_evenement_option(p_proposition uuid, p_ligne uuid, p_conseiller uuid, p_detail jsonb)
returns void
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_dossier uuid;
begin
  v_proposition := coalesce(p_proposition, (select proposition_id from proposition_lignes where id = p_ligne));
  select dossier_id into v_dossier from propositions where id = v_proposition;
  if v_dossier is null then
    return; -- ligne inconnue : rien à rattacher
  end if;
  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'option', case when p_conseiller is null then 'systeme' else 'conseiller' end::auteur_evenement,
      p_conseiller, coalesce(p_detail, '{}'));
end $$;

revoke execute on function enregistrer_accord(uuid, uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke execute on function consommer_accord(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function terminer_pose_option(uuid, boolean, text, timestamptz, jsonb, text) from public, anon, authenticated;
revoke execute on function terminer_confirmation(uuid, boolean, uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function terminer_annulation(uuid, boolean, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function tracer_evenement_option(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function enregistrer_accord(uuid, uuid, timestamptz, timestamptz, integer) to service_role;
grant execute on function consommer_accord(uuid, timestamptz) to service_role;
grant execute on function terminer_pose_option(uuid, boolean, text, timestamptz, jsonb, text) to service_role;
grant execute on function terminer_confirmation(uuid, boolean, uuid, text, jsonb, text) to service_role;
grant execute on function terminer_annulation(uuid, boolean, uuid, jsonb, text) to service_role;
grant execute on function tracer_evenement_option(uuid, uuid, uuid, jsonb) to service_role;
