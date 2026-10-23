-- Réservation d'un hébergement de plusieurs nuits (suite de 20261022180100_nuits_par_ligne.sql). Le simulateur ne pose
-- une option, et ne confirme une réservation, que pour une date : une ligne de N nuits demande N options, puis N
-- réservations. La démarche reste UNE ligne d'options par ligne de proposition (un accord, une seconde validation) ;
-- options.nuits_simulateur garde le détail, une entrée par nuit : {date, option_id, prix_total_cents, reservation_id?}.
-- option_id_simulateur et reservation_id_simulateur gardent ceux de la première nuit (contraintes et écrans inchangés).
-- Une ligne d'une nuit : une seule entrée, comportement identique à avant.

alter table options add column nuits_simulateur jsonb not null default '[]' check (jsonb_typeof(nuits_simulateur) = 'array');

drop function terminer_pose_option(uuid, boolean, text, timestamptz, jsonb, text);
create function terminer_pose_option(p_option uuid, p_ok boolean, p_option_id_simulateur text, p_expire_le timestamptz,
  p_reponse jsonb, p_raison text, p_nuits jsonb default null)
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
    -- le cas d'usage a vérifié que le prix du simulateur (somme des nuits) est celui accordé : il est figé tel quel
    update options set statut = 'posee', option_id_simulateur = p_option_id_simulateur, prix_option_cents = prix_accorde_cents,
      expire_le = p_expire_le, reponse_option = p_reponse, nuits_simulateur = coalesce(p_nuits, '[]')
      where id = p_option;
  else
    update options set statut = 'echec', reponse_option = p_reponse where id = p_option;
  end if;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, detail)
    values (v_dossier, v_proposition, 'option', 'systeme', jsonb_strip_nulls(jsonb_build_object('type', 'option', 'option_id', p_option,
      'ligne_id', v_ligne, 'ok', p_ok, 'option_id_simulateur', p_option_id_simulateur, 'expire_le', p_expire_le, 'raison', p_raison)));
end $$;

drop function terminer_confirmation(uuid, boolean, uuid, text, jsonb, text);
create function terminer_confirmation(p_option uuid, p_ok boolean, p_conseiller uuid, p_reservation_id_simulateur text,
  p_reponse jsonb, p_raison text, p_nuits jsonb default null)
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
    reservation_id_simulateur = p_reservation_id_simulateur, reponse_confirmation = p_reponse,
    nuits_simulateur = coalesce(p_nuits, nuits_simulateur)
    where id = p_option;
  update proposition_lignes set statut = 'reservee' where id = v_ligne and statut = 'confirme';
  if not found then
    raise exception 'la ligne % n''est plus confirmée', v_ligne using errcode = 'OT002';
  end if;
  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'reservation', 'conseiller', p_conseiller, jsonb_build_object('type', 'reservation',
      'option_id', p_option, 'ligne_id', v_ligne, 'reservation_id_simulateur', p_reservation_id_simulateur));

  -- dernière ligne comptée réservée : la proposition est réservée et le dossier gagné (suivre_proposition)
  select statut into v_statut from propositions where id = v_proposition;
  return suivre_proposition(v_proposition, v_statut);
end $$;

revoke execute on function terminer_pose_option(uuid, boolean, text, timestamptz, jsonb, text, jsonb) from public, anon, authenticated;
revoke execute on function terminer_confirmation(uuid, boolean, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function terminer_pose_option(uuid, boolean, text, timestamptz, jsonb, text, jsonb) to service_role;
grant execute on function terminer_confirmation(uuid, boolean, uuid, text, jsonb, text, jsonb) to service_role;
