-- Tri d'un dossier (E3.1) : validée, à corriger ou refusée. La décision est écrite sur la fiche de la version courante
-- ET le statut du dossier change, journal compris, dans la même transaction.
--
-- trier_dossier(dossier, ancien statut, décision, conseiller, détail) :
--   - passe le dossier de p_ancien à la décision par changer_statut (E0.7) : ligne verrouillée, OT002 si le statut
--     a changé entre-temps (deux conseillers qui trient en même temps : le second est refusé) ;
--   - écrit fiches.decision sur la fiche de la version courante de la demande ; sans fiche, rien n'est écrit (OT001).
-- La matrice (fiche_prete → validee | a_corriger | refusee ; a_corriger → validee | refusee) est vérifiée avant l'appel par le
-- cas d'usage (types/transitions.ts). Réservée au serveur (service_role).

create function trier_dossier(
  p_dossier uuid,
  p_ancien text,
  p_decision decision_tri,
  p_conseiller uuid,
  p_detail jsonb default '{}'
) returns bigint                 -- id de la ligne d'historique
language plpgsql set search_path = public as $$
declare
  v_historique bigint;
  v_fiche uuid;
begin
  v_historique := changer_statut('dossier', p_dossier, p_ancien, p_decision::text, 'conseiller', p_conseiller, p_detail);

  update fiches f set decision = p_decision
    from demandes d
    where f.demande_id = d.id and d.dossier_id = p_dossier and d.remplacee_le is null
    returning f.id into v_fiche;
  if v_fiche is null then
    raise exception 'aucune fiche à trier pour le dossier %', p_dossier using errcode = 'OT001';
  end if;
  return v_historique;
end $$;

revoke execute on function trier_dossier(uuid, text, decision_tri, uuid, jsonb) from public, anon, authenticated;
grant execute on function trier_dossier(uuid, text, decision_tri, uuid, jsonb) to service_role;
