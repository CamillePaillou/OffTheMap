-- Mails modèles (E5.4) : le conseiller envoie le mail depuis sa messagerie, puis le marque « envoyé ».
-- marquer_mail_envoye écrit l'événement `mail` du journal (détail : le modèle, rien d'autre) et vérifie que
-- le modèle a un sens à ce moment du dossier :
--   - rendez_vous  : dossier validé (il passe alors en rdv_propose, par changer_statut) ou rendez-vous déjà proposé ;
--   - a_corriger   : dossier à corriger ;
--   - proposition  : proposition du dossier envoyée ou au-delà (tous ses prix ont été vérifiés, E5.1) ;
--   - confirmation : proposition du dossier réservée.
-- Sinon : OT010, rien n'est écrit. Réservée au serveur (service_role).

create function marquer_mail_envoye(p_dossier uuid, p_proposition uuid, p_modele text, p_conseiller uuid)
returns bigint
language plpgsql set search_path = public as $$
declare
  v_dossier statut_dossier;
  v_proposition statut_proposition;
  v_historique bigint;
begin
  select statut into v_dossier from dossiers where id = p_dossier for update;
  if not found then
    raise exception 'dossier introuvable : %', p_dossier using errcode = 'OT001';
  end if;
  if p_proposition is not null then
    select statut into v_proposition from propositions where id = p_proposition and dossier_id = p_dossier;
    if not found then
      raise exception 'proposition % absente du dossier %', p_proposition, p_dossier using errcode = 'OT001';
    end if;
  end if;

  if p_modele = 'rendez_vous' and v_dossier in ('validee', 'rdv_propose') then
    if v_dossier = 'validee' then
      perform changer_statut('dossier', p_dossier, 'validee', 'rdv_propose', 'conseiller', p_conseiller,
        jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'validee', 'nouveau', 'rdv_propose'));
    end if;
  elsif p_modele = 'a_corriger' and v_dossier = 'a_corriger' then
    null;
  elsif p_modele = 'proposition' and v_proposition in ('envoyee', 'sans_reponse', 'changement_demande', 'acceptee', 'depot_recu', 'reservee') then
    null;
  elsif p_modele = 'confirmation' and v_proposition = 'reservee' then
    null;
  else
    raise exception 'mail « % » sans objet pour ce dossier (%) ou cette proposition (%)', p_modele, v_dossier, v_proposition
      using errcode = 'OT010';
  end if;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (p_dossier, p_proposition, 'mail', 'conseiller', p_conseiller, jsonb_build_object('type', 'mail', 'modele', p_modele))
    returning id into v_historique;
  return v_historique;
end $$;

revoke execute on function marquer_mail_envoye(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function marquer_mail_envoye(uuid, uuid, text, uuid) to service_role;
