-- Vérifie les données de démonstration (E0.10), en lecture seule : à lancer après le seed.
\set ON_ERROR_STOP on
do $$
declare
  manquants text;
  n int;
begin
  -- catalogue : les 9 prestations du simulateur, sans doublon
  select count(*) into n from prestations where id in (
    'train-nantes-01','hotel-nantes-01','activite-nantes-01','train-lyon-01','hotel-lyon-01','activite-lyon-01',
    'train-lille-01','hotel-lille-01','activite-lille-01');
  if n <> 9 then raise exception 'catalogue : % prestations du simulateur sur 9', n; end if;

  -- un dossier de démonstration à chaque étape clé
  select string_agg(s, ', ') into manquants from unnest(array[
    'nouvelle','erreur','fiche_prete','a_corriger','refusee','go','rdv_propose','entretien_fait','en_proposition','gagnee']) s
  where not exists (select 1 from dossiers d where d.statut::text = s and d.id::text like 'd0551e00-%');
  if manquants is not null then raise exception 'étapes du dossier sans exemple : %', manquants; end if;

  select string_agg(s, ', ') into manquants from unnest(array['a_verifier','prete','envoyee','depot_recu','reservee']) s
  where not exists (select 1 from propositions p where p.statut::text = s);
  if manquants is not null then raise exception 'étapes de la proposition sans exemple : %', manquants; end if;

  if not exists (select 1 from verifications where statut = 'echec') then raise exception 'aucune vérification en échec'; end if;
  if not exists (select 1 from proposition_lignes where statut = 'indisponible') then raise exception 'aucune ligne indisponible'; end if;
  if not exists (select 1 from options where statut = 'posee') then raise exception 'aucune option posée'; end if;
  if not exists (select 1 from options where statut = 'confirmee') then raise exception 'aucune réservation confirmée'; end if;

  -- total de chaque proposition = somme des lignes hors remplacee et indisponible (règles de chiffrage)
  select count(*) into n from propositions p
  where p.total_cents is distinct from (select coalesce(sum(l.total_ligne_cents), 0) from proposition_lignes l
                                        where l.proposition_id = p.id and l.statut not in ('remplacee', 'indisponible'));
  if n > 0 then raise exception '% proposition(s) avec un total incohérent', n; end if;

  -- chaque dossier a un journal qui finit sur son statut courant
  select count(*) into n from dossiers d where d.id::text like 'd0551e00-%' and d.statut::text is distinct from (
    select h.nouveau_statut from historique_dossier h
    where h.dossier_id = d.id and h.proposition_id is null order by h.cree_le desc, h.id desc limit 1);
  if n > 0 then raise exception '% dossier(s) dont le journal ne finit pas sur le statut courant', n; end if;

  raise notice 'SEED OK : catalogue, étapes clés, totaux et journaux vérifiés';
end $$;
