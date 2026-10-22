-- Prestation indisponible après le dépôt (E7.4) : sur la proposition de démonstration au dépôt reçu (seed), l'atelier
-- devient indisponible, il est remplacé avec l'accord du client, l'hôtel est retiré, puis le reste est réservé.
-- Lancement après le seed (make test-db, CI). Transaction annulée : la base ne change pas.
\set ON_ERROR_STOP on
\o /dev/null
begin;

create function etape(etiquette text, sql text, attendu text) returns void language plpgsql as $$
declare obtenu text;
begin
  execute sql into obtenu;
  if obtenu is distinct from attendu then
    raise exception 'ÉCHEC : % : attendu %, obtenu %', etiquette, attendu, obtenu;
  end if;
  raise notice 'OK : %', etiquette;
end $$;
-- l'appel doit être refusé avec ce code, sans rien écrire
create function refus(etiquette text, sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : % : accepté, refus % attendu', etiquette, code;
exception when others then
  if sqlstate <> code then raise exception 'ÉCHEC : % : refus % attendu, obtenu % (%)', etiquette, code, sqlstate, sqlerrm; end if;
  raise notice 'OK : %', etiquette;
end $$;

\set p 'b0b05100-0000-4000-8000-000012000000'
\set dossier 'd0551e00-0000-4000-8000-000012000000'
\set train 'a1e00000-0000-4000-8000-000012000001'
\set hotel 'a1e00000-0000-4000-8000-000012000002'
\set atelier 'a1e00000-0000-4000-8000-000012000003'
\set c '11111111-1111-4111-8111-111111111111'
select etape('0. proposition au dépôt reçu', format('select statut::text from propositions where id = %L', :'p'), 'depot_recu');

-- 1. Après le dépôt, une ligne ne repasse pas à vérifier
select refus('1. pas de retour à vérifier après le dépôt',
  format($q$select changer_ligne(%L, 'confirme', 'a_verifier', null, null, %L)$q$, :'atelier', :'c'), 'OT008');

-- 2. L'atelier est complet : la conseillère le marque indisponible, la proposition reste au dépôt reçu
select etape('2. atelier indisponible', format($q$select changer_ligne(%L, 'confirme', 'indisponible', null, null, %L)::text$q$, :'atelier', :'c'), 'depot_recu');
select etape('2. total sans l''atelier', format('select total_cents::text from propositions where id = %L', :'p'), '28800');

-- 3. Remplacement : refusé sans l'accord du client, accepté avec ; la remplaçante naît à vérifier
select refus('3. remplacement sans accord du client',
  format($q$select remplacer_ligne(%L, 'activite-nantes-01', %L, '2026-11-08', null, false)$q$, :'atelier', :'c'), 'OT013');
select remplacer_ligne(:'atelier', 'activite-nantes-01', :'c', '2026-11-08', null, true) as atelier2 \gset
select etape('3. ancienne remplacée, nouvelle à vérifier', format($q$select string_agg(statut::text, ' ' order by date) from proposition_lignes
  where id in (%L, %L)$q$, :'atelier', :'atelier2'), 'remplacee a_verifier');
select etape('3. remplacement journalisé avec l''accord du client', format($q$select detail->>'type' || ' ' || (detail->>'accord_client')
  from historique_dossier where proposition_id = %L and type = 'changement'$q$, :'p'), 'remplacement true');
select etape('3. proposition toujours au dépôt reçu', format('select statut::text from propositions where id = %L', :'p'), 'depot_recu');

-- 4. Le prix de la remplaçante est vérifié puis confirmé
insert into verifications (ligne_id, demande_par, statut, prix_unitaire_cents, prix_total_cents, places_restantes, modele, nb_tours, arret, resume)
  values (:'atelier2', :'c', 'ok', 3500, 7000, 6, 'modele-du-test', 2, 'conclusion', 'Disponible le dimanche.');
select etape('4. prix de la remplaçante confirmé', format($q$select changer_ligne(%L, 'a_verifier', 'confirme', 3500, 'agent', %L)::text$q$, :'atelier2', :'c'), 'depot_recu');
select etape('4. total avec la remplaçante', format('select total_cents::text from propositions where id = %L', :'p'), '35800');

-- 5. Retrait : seule une ligne indisponible se retire, avec l'accord du client, et jamais la dernière
select refus('5. retrait d''une ligne confirmée', format('select retirer_ligne(%L, %L, true)', :'hotel', :'c'), 'OT002');
select changer_ligne(:'hotel', 'confirme', 'indisponible', null, null, :'c');
select refus('5. retrait sans accord du client', format('select retirer_ligne(%L, %L, false)', :'hotel', :'c'), 'OT013');
savepoint derniere;
select changer_ligne(:'train', 'confirme', 'indisponible', null, null, :'c');
select changer_ligne(:'atelier2', 'confirme', 'indisponible', null, null, :'c');
select refus('5. la dernière prestation ne se retire pas', format('select retirer_ligne(%L, %L, true)', :'hotel', :'c'), 'OT014');
rollback to savepoint derniere;
select etape('5. hôtel retiré', format('select retirer_ligne(%L, %L, true)::text', :'hotel', :'c'), 'depot_recu');
select etape('5. total sans l''hôtel', format('select total_cents::text from propositions where id = %L', :'p'), '16600');
select etape('5. retrait journalisé', format($q$select count(*)::text from historique_dossier where proposition_id = %L and type = 'changement'
  and detail->>'type' = 'retrait'$q$, :'p'), '1');

-- 6. Une option encore valable empêche de marquer la ligne indisponible
select enregistrer_accord(:'train', :'c', now(), now() + interval '10 minutes', 9600) as accord_train \gset
select refus('6. accord en cours : pas d''indisponibilité', format($q$select changer_ligne(%L, 'confirme', 'indisponible', null, null, %L)$q$, :'train', :'c'), 'OT012');

-- 7. Le train et l'atelier remplaçant sont réservés : la proposition est réservée, le dossier conclu
select consommer_accord(:'accord_train', now());
select terminer_pose_option(:'accord_train', true, 'opt_train', now() + interval '2 days', '{}', null);
select etape('7. train réservé', format($q$select terminer_confirmation(%L, true, %L, 'res_train', '{}', null)::text$q$, :'accord_train', :'c'), 'depot_recu');
select enregistrer_accord(:'atelier2', :'c', now(), now() + interval '10 minutes', 7000) as accord_atelier \gset
select consommer_accord(:'accord_atelier', now());
select terminer_pose_option(:'accord_atelier', true, 'opt_atelier', now() + interval '2 days', '{}', null);
select etape('7. dernière ligne comptée réservée : proposition réservée',
  format($q$select terminer_confirmation(%L, true, %L, 'res_atelier', '{}', null)::text$q$, :'accord_atelier', :'c'), 'reservee');
select etape('7. dossier conclu', format('select statut::text from dossiers where id = %L', :'dossier'), 'gagnee');
select etape('7. lignes finales', format($q$select string_agg(statut::text, ' ' order by statut::text) from proposition_lignes where proposition_id = %L$q$, :'p'),
  'remplacee reservee reservee retiree');

\o
\echo 'INDISPONIBLE APRÈS DÉPÔT OK : remplacement et retrait avec l''accord du client, puis réservation.'
rollback;
