-- Fonction de transition de statut (E0.7, ADR-0008) : le statut et la ligne de historique_dossier sont écrits
-- dans la même transaction. Si l'une des deux écritures échoue, aucune n'a lieu.
--
-- La matrice des transitions autorisées est vérifiée avant l'appel par le cas d'usage (src/domain/transition.ts,
-- source unique : types/transitions.ts). Ici, la base garantit le reste :
--   - la ligne est verrouillée, et son statut doit encore valoir p_ancien : deux transitions concurrentes
--     ne peuvent pas partir du même état (la seconde est refusée, code OT002) ;
--   - seul le serveur (service_role) peut l'appeler : ni un visiteur ni un conseiller connecté.
create function changer_statut(
  p_cible text,                -- 'dossier' ou 'proposition'
  p_id uuid,
  p_ancien text,
  p_nouveau text,
  p_auteur auteur_evenement,
  p_auteur_id uuid,
  p_detail jsonb default '{}'
) returns bigint               -- id de la ligne d'historique créée
language plpgsql set search_path = public as $$
declare
  v_actuel text;
  v_dossier uuid;
  v_proposition uuid;
  v_historique bigint;
begin
  if p_cible = 'dossier' then
    select statut::text, id into v_actuel, v_dossier from dossiers where id = p_id for update;
  elsif p_cible = 'proposition' then
    select statut::text, dossier_id, id into v_actuel, v_dossier, v_proposition from propositions where id = p_id for update;
  else
    raise exception 'cible inconnue : %', p_cible using errcode = 'OT003';
  end if;

  if v_dossier is null then
    raise exception '% introuvable : %', p_cible, p_id using errcode = 'OT001';
  end if;
  if v_actuel is distinct from p_ancien then
    raise exception 'statut modifié entre-temps : attendu %, trouvé %', p_ancien, v_actuel using errcode = 'OT002';
  end if;

  if p_cible = 'dossier' then
    update dossiers set statut = p_nouveau::statut_dossier where id = p_id;
  else
    update propositions set statut = p_nouveau::statut_proposition where id = p_id;
  end if;

  insert into historique_dossier (dossier_id, proposition_id, type, ancien_statut, nouveau_statut, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'statut', p_ancien, p_nouveau, p_auteur, p_auteur_id, coalesce(p_detail, '{}'))
    returning id into v_historique;
  return v_historique;
end $$;

-- Par défaut PostgreSQL donne l'exécution à tout le monde : on la réserve au serveur.
revoke execute on function changer_statut(text, uuid, text, text, auteur_evenement, uuid, jsonb) from public, anon, authenticated;
grant execute on function changer_statut(text, uuid, text, text, auteur_evenement, uuid, jsonb) to service_role;
