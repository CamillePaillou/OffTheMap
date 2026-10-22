-- Espace client (suivi de la demande) : numéro de dossier, suivi public, propriété par l'adresse confirmée,
-- réponse en ligne à la proposition. Lancement après le seed (make test-db, CI). Transaction annulée : la base ne change pas.
-- Le client est simulé comme PostgREST le fait : rôle authenticated et identifiant dans request.jwt.claim.sub.
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
create function refus(etiquette text, sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ÉCHEC : % : accepté, refus % attendu', etiquette, code;
exception when others then
  if sqlstate <> code then raise exception 'ÉCHEC : % : refus % attendu, obtenu % (%)', etiquette, code, sqlstate, sqlerrm; end if;
  raise notice 'OK : %', etiquette;
end $$;
-- se présente comme un utilisateur connecté (null : visiteur anonyme)
create function en_tant_que(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user)::text end, true);
end $$;
-- lignes visibles d'une table pour le rôle courant : 0 si RLS les cache ou si le rôle n'a aucun droit sur la table
create function lignes_visibles(p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from %I', p_table) into n;
  return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on function etape(text, text, text), refus(text, text, text), en_tant_que(uuid), lignes_visibles(text) to anon, authenticated;

\set jade '22222222-2222-4222-8222-222222222222'
\set tom '33333333-3333-4333-8333-333333333333'
\set d_jade 'd0551e00-0000-4000-8000-000011000000'
\set d_tom 'd0551e00-0000-4000-8000-000012000000'
\set p_jade 'b0b05100-0000-4000-8000-000011000000'
\set p_tom 'b0b05100-0000-4000-8000-000012000000'

-- 1. Numéro de dossier
select etape('1. chaque dossier a un numéro au format DT-XXXX-XXXX',
  $q$select count(*)::text from dossiers where reference !~ '^DT-[A-Z2-9]{4}-[A-Z2-9]{4}$'$q$, '0');
select etape('1. 500 numéros tirés : format lisible (sans 0, O, 1, I, L) et tous différents',
  $q$select count(distinct r)::text from (select generer_reference() r from generate_series(1, 500)) x
     where r ~ '^DT-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$'$q$, '500');
select etape('1. un nouveau dossier reçoit son numéro sans qu''on le donne',
  $q$with d as (insert into dossiers (statut) values ('nouvelle') returning reference)
     select (reference ~ '^DT-')::text from d$q$, 'true');
select refus('1. deux dossiers ne partagent pas un numéro',
  $q$insert into dossiers (statut, reference) values ('nouvelle', 'DT-JADE-NANT')$q$, '23505');

-- 2. Suivi public, sans compte
set local role anon;
select en_tant_que(null);
select etape('2. un visiteur suit le dossier avec son numéro, même mal tapé',
  $q$select (suivi_public(' dt jade-nant ') ->> 'dossier_statut') || '/' || (suivi_public('jadenant') ->> 'dossier_statut') || '/' || (suivi_public('DT-JADE-NANT') ->> 'proposition_statut')$q$,
  'en_proposition/en_proposition/envoyee');
select etape('2. le suivi public ne montre que le numéro, les statuts et la date',
  $q$select string_agg(k, ',' order by k) from jsonb_object_keys(suivi_public('DT-JADE-NANT')) k$q$,
  'dossier_statut,mis_a_jour_le,proposition_statut,reference');
select etape('2. un numéro inconnu ne renvoie rien', $q$select coalesce(suivi_public('DT-AAAA-AAAA')::text, 'rien')$q$, 'rien');
select refus('2. un visiteur ne lit pas les demandes', $q$select mes_demandes()$q$, '42501');
select refus('2. un visiteur ne répond pas à une proposition',
  format($q$select repondre_proposition(%L, 'acceptee', null)$q$, :'p_jade'), '42501');
select refus('2. un visiteur ne tire pas de numéro', $q$select generer_reference()$q$, '42501');
reset role;

-- 3. Compte client : propriété par l'adresse confirmée
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', :'tom', 'authenticated', 'authenticated', 'Tom@Example.org', null, now(), now());
set local role authenticated;
select en_tant_que(:'jade');
select etape('3. Jade retrouve sa demande, et seulement la sienne',
  $q$select string_agg(x ->> 'reference', ',') from jsonb_array_elements(mes_demandes()) x$q$, 'DT-JADE-NANT');
select etape('3. Jade lit sa proposition envoyée, signée par le conseiller, avec ses lignes',
  format($q$select (ma_demande(%L) #>> '{proposition,conseiller}') || '/' || (jsonb_array_length(ma_demande(%L) #> '{proposition,lignes}') > 0)$q$, :'d_jade', :'d_jade'),
  'Camille (démo)/true');
select etape('3. Jade ne lit pas le dossier de Tom', format($q$select coalesce(ma_demande(%L)::text, 'rien')$q$, :'d_tom'), 'rien');
select etape('3. aucune table n''est ouverte au client (dossiers, demandes, réponses)',
  $q$select (lignes_visibles('dossiers') + lignes_visibles('demandes') + lignes_visibles('reponses_client') + lignes_visibles('propositions'))::text$q$, '0');
select en_tant_que(:'tom');
select etape('3. adresse non confirmée : Tom ne voit rien, même avec l''adresse de la demande',
  $q$select mes_demandes()::text$q$, '[]');
select refus('3. adresse non confirmée : Tom ne répond pas', format($q$select repondre_proposition(%L, 'acceptee', null)$q$, :'p_tom'), 'OT020');
reset role;
update auth.users set email_confirmed_at = now() where id = :'tom';
set local role authenticated;
select en_tant_que(:'tom');
select etape('3. adresse confirmée (casse différente) : Tom retrouve sa demande',
  $q$select string_agg(x ->> 'reference', ',') from jsonb_array_elements(mes_demandes()) x$q$, 'DT-SEED-N2N2');

-- 4. Réponse en ligne
select refus('4. pas de réponse quand la proposition n''attend plus de réponse (dépôt reçu)',
  format($q$select repondre_proposition(%L, 'acceptee', null)$q$, :'p_tom'), 'OT021');
select refus('4. Tom ne répond pas à la proposition de Jade',
  format($q$select repondre_proposition(%L, 'acceptee', null)$q$, :'p_jade'), 'OT020');
select en_tant_que(:'jade');
select refus('4. un changement sans message est refusé',
  format($q$select repondre_proposition(%L, 'changement', '   ')$q$, :'p_jade'), '23514');
select refus('4. un type inconnu est refusé',
  format($q$select repondre_proposition(%L, 'reservee', null)$q$, :'p_jade'), '23514');
select etape('4. Jade demande un changement',
  format($q$select repondre_proposition(%L, 'changement', ' Plutôt un hôtel près de la gare. ')::text$q$, :'p_jade'), '');
select refus('4. une seule réponse par proposition', format($q$select repondre_proposition(%L, 'acceptee', null)$q$, :'p_jade'), '23505');
select etape('4. la réponse apparaît dans l''espace de Jade',
  format($q$select (ma_demande(%L) #>> '{proposition,reponse,type}') || '/' || (ma_demande(%L) #>> '{proposition,reponse,message}')$q$, :'d_jade', :'d_jade'),
  'changement/Plutôt un hôtel près de la gare.');
reset role;
select etape('4. la réponse est enregistrée avec son auteur, le statut ne change pas sans le conseiller',
  format($q$select r.auteur::text || '/' || p.statut from reponses_client r join propositions p on p.id = r.proposition_id where p.id = %L$q$, :'p_jade'),
  :'jade' || '/envoyee');
set local role authenticated;
select en_tant_que('11111111-1111-4111-8111-111111111111');
select etape('4. le conseiller lit la réponse',
  format($q$select count(*)::text from reponses_client where proposition_id = %L$q$, :'p_jade'), '1');
reset role;

rollback;
\o
\echo 'test_espace_client : OK'
