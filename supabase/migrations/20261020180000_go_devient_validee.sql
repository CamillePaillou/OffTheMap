-- « go » devient « validee » (E3.1) : le conseiller valide une demande, il ne lui donne plus un « go ».
-- Renommage des valeurs d'énumération : les lignes existantes suivent sans être réécrites.
-- historique_dossier garde les statuts en texte (ancien_statut, nouveau_statut, detail) : on les aligne.
alter type statut_dossier rename value 'go' to 'validee';
alter type decision_tri rename value 'go' to 'validee';

update historique_dossier set ancien_statut = 'validee' where type = 'statut' and proposition_id is null and ancien_statut = 'go';
update historique_dossier set nouveau_statut = 'validee' where type = 'statut' and proposition_id is null and nouveau_statut = 'go';
update historique_dossier
  set detail = detail
    || case when detail ->> 'ancien' = 'go' then '{"ancien": "validee"}'::jsonb else '{}'::jsonb end
    || case when detail ->> 'nouveau' = 'go' then '{"nouveau": "validee"}'::jsonb else '{}'::jsonb end
    || case when detail ->> 'decision' = 'go' then '{"decision": "validee"}'::jsonb else '{}'::jsonb end
  where type = 'statut' and detail ->> 'cible' = 'dossier'
    and 'go' in (detail ->> 'ancien', detail ->> 'nouveau', detail ->> 'decision');
