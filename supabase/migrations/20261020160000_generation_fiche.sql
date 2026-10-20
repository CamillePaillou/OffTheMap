-- Génération automatique de la fiche (E2.2) : la fin d'une génération écrit la fiche ET le statut du dossier
-- ensemble, ou rien.
--
-- terminer_generation_fiche(dossier, modèle, génération) :
--   - verrouille le dossier, qui doit être en fiche_en_cours (sinon OT002 : une autre génération ou le conseiller
--     est passé avant, rien n'est écrit) ;
--   - écrit la fiche de la version courante de la demande par enregistrer_generation_fiche (E2.1) ;
--   - passe le dossier en fiche_prete, ou en erreur si la génération porte {"erreur": ...}, par changer_statut (E0.7),
--     journal compris.
-- Le lancement (nouvelle → fiche_en_cours) passe par changer_statut comme toute transition : de deux appels
-- simultanés, un seul gagne (OT002 pour l'autre), donc une seule génération et une seule fiche.
-- Réservée au serveur (service_role).

create function terminer_generation_fiche(p_dossier uuid, p_modele text, p_generation jsonb)
returns statut_dossier
language plpgsql set search_path = public as $$
declare
  v_statut statut_dossier;
  v_demande uuid;
  v_nouveau statut_dossier;
begin
  select statut into v_statut from dossiers where id = p_dossier for update;
  if not found then
    raise exception 'dossier introuvable : %', p_dossier using errcode = 'OT001';
  end if;
  if v_statut <> 'fiche_en_cours' then
    raise exception 'statut modifié entre-temps : attendu fiche_en_cours, trouvé %', v_statut using errcode = 'OT002';
  end if;

  select id into v_demande from demandes
    where dossier_id = p_dossier and remplacee_le is null order by version desc limit 1;
  if v_demande is null then
    raise exception 'aucune demande courante pour le dossier %', p_dossier using errcode = 'OT001';
  end if;

  perform enregistrer_generation_fiche(v_demande, p_modele, p_generation);

  v_nouveau := case when p_generation ? 'erreur' then 'erreur' else 'fiche_prete' end;
  perform changer_statut('dossier', p_dossier, 'fiche_en_cours', v_nouveau::text, 'systeme', null,
    jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'fiche_en_cours', 'nouveau', v_nouveau));
  return v_nouveau;
end $$;

revoke execute on function terminer_generation_fiche(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function terminer_generation_fiche(uuid, text, jsonb) to service_role;
