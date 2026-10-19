-- Vérifie les règles portées par le schéma. Chaque bloc doit échouer ou réussir comme annoncé.
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas modifiée.
\set ON_ERROR_STOP on
begin;
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into profils values ('00000000-0000-0000-0000-00000000000a', 'Conseillère Alice');
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite) values
  ('activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 'Nantes', 3500, 10);
insert into dossiers (id) values ('00000000-0000-0000-0000-0000000000d1');
insert into demandes (id, dossier_id, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', true, true, 'Inès', 'ines@example.org',
          '2026-11-07', '2026-11-08', 1, '{adulte,adulte}', 40000);
insert into propositions (id, dossier_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1');
insert into proposition_lignes (id, proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'activite-nantes-01', '2026-11-07', 2, 3500);

create function doit_echouer(sql text, etiquette text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'OK refusé : %', etiquette; return; end;
  raise exception 'ÉCHEC : accepté alors que ça devait être refusé : %', etiquette;
end $$;

create function doit_valoir(sql text, attendu bigint, etiquette text) returns void language plpgsql as $$
declare obtenu bigint;
begin
  execute sql into obtenu;
  if obtenu is distinct from attendu then
    raise exception 'ÉCHEC : % : attendu %, obtenu %', etiquette, attendu, obtenu;
  end if;
  raise notice 'OK : %', etiquette;
end $$;

-- les tables du noyau (E0.16) et de l'agent (E0.5) existent
select doit_valoir($$select count(*) from information_schema.tables where table_schema = 'public' and table_name in
  ('dossiers', 'demandes', 'fiches', 'prestations', 'propositions', 'proposition_lignes', 'historique_dossier',
   'profils', 'verifications', 'options')$$, 10, 'tables créées');

select doit_echouer($$insert into demandes (dossier_id, version, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs)
  values ('00000000-0000-0000-0000-0000000000d1', 2, false, true, 'X', 'x@y.fr', '2026-11-07', '2026-11-08', 1, '{adulte}')$$, 'demande sans consentement RGPD');
select doit_echouer($$insert into demandes (dossier_id, version, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs)
  values ('00000000-0000-0000-0000-0000000000d1', 2, true, true, 'X', 'x@y.fr', '2026-11-07', '2026-11-08', 2, '{adulte}')$$, 'plus de nuits que de jours');
select doit_echouer($$insert into fiches (demande_id) values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e1')$$, 'deux fiches pour une version');
select doit_echouer($$insert into proposition_lignes (proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
  values ('00000000-0000-0000-0000-0000000000f1', 'prestation-inventee', '2026-11-07', 2, 1000)$$, 'prestation hors catalogue');
select doit_echouer($$insert into proposition_lignes (proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
  values ('00000000-0000-0000-0000-0000000000f1', 'activite-nantes-01', '2026-11-07', 21, 3500)$$, 'plus de 20 participants');
select doit_echouer($$update proposition_lignes set statut = 'confirme' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'ligne confirmée sans prix');
select doit_echouer($$update proposition_lignes set prix_confirme_cents = 4000 where id = '00000000-0000-0000-0000-0000000000a1'$$, 'prix confirmé sans source ni auteur');
select doit_echouer($$insert into verifications (ligne_id, demande_par, statut, prix_unitaire_cents, prix_total_cents, places_restantes, modele, nb_tours, arret)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'echec', 4000, 8000, 10, 'm', 1, 'echec_serveur')$$, 'prix annoncé alors que le simulateur a échoué');
select doit_echouer($$insert into verifications (ligne_id, demande_par, statut, modele, nb_tours, arret)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'ok', 'm', 1, 'conclusion')$$, 'statut ok sans prix ni places');

-- parcours nominal : vérification 40 €, accord, option, confirmation
insert into verifications (id, ligne_id, demande_par, statut, prix_unitaire_cents, prix_total_cents, places_restantes, modele, nb_tours, arret)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'ok', 4000, 8000, 10, 'modele-gratuit', 2, 'conclusion');
update proposition_lignes set prix_confirme_cents = 4000, source = 'agent', confirme_le = now(),
  confirme_par = '00000000-0000-0000-0000-00000000000a', statut = 'confirme' where id = '00000000-0000-0000-0000-0000000000a1';
select doit_valoir($$select total_ligne_cents from proposition_lignes where id = '00000000-0000-0000-0000-0000000000a1'$$, 8000, 'total de ligne = prix confirmé × participants');
insert into options (id, ligne_id, verification_id, accord_par, prix_accorde_cents)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 8000);
select doit_echouer($$insert into options (ligne_id, verification_id, accord_par, prix_accorde_cents)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 8000)$$, 'deux accords en cours sur la même ligne');
select doit_echouer($$update options set statut = 'posee' where id = '00000000-0000-0000-0000-0000000000c1'$$, 'option posée sans réponse du simulateur ni accord consommé');
update options set statut = 'posee', accord_utilise = true, option_id_simulateur = 'opt_abc', prix_option_cents = 9000,
  expire_le = now() + interval '2 days' where id = '00000000-0000-0000-0000-0000000000c1';
select doit_echouer($$update options set statut = 'confirmee', reservation_id_simulateur = 'res_x', confirme_par = '00000000-0000-0000-0000-00000000000a', confirme_le = now()
  where id = '00000000-0000-0000-0000-0000000000c1'$$, 'confirmation alors que le prix de l''option a changé');
update options set prix_option_cents = 8000 where id = '00000000-0000-0000-0000-0000000000c1';
update options set statut = 'confirmee', reservation_id_simulateur = 'res_x', confirme_par = '00000000-0000-0000-0000-00000000000a', confirme_le = now()
  where id = '00000000-0000-0000-0000-0000000000c1';
select doit_echouer($$insert into historique_dossier (dossier_id, type, nouveau_statut, auteur) values ('00000000-0000-0000-0000-0000000000d1', 'statut', 'go', 'conseiller')$$, 'événement conseiller sans auteur identifié');

-- RLS : un visiteur ne lit rien, un compte sans profil non plus, un conseiller lit tout
set role anon;
select doit_valoir($$select count(*) from demandes$$, 0, 'un visiteur ne lit rien');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
select doit_valoir($$select count(*) from demandes$$, 0, 'un compte sans profil ne lit rien');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select doit_valoir($$select count(*) from demandes$$, 1, 'un conseiller lit tout');
select doit_echouer($$insert into dossiers default values$$, 'écriture directe par un conseiller');
reset role;
rollback;
\echo TOUS LES TESTS SONT PASSÉS
