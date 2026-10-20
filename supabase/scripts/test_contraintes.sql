-- Vérifie les règles portées par le schéma. Chaque bloc doit échouer ou réussir comme annoncé.
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas modifiée.
\set ON_ERROR_STOP on
begin;
grant usage on schema public to anon, authenticated;
-- comme Supabase : anon et authenticated ont tous les droits SQL, seule la RLS les limite
grant all on all tables in schema public to anon, authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into profils values ('00000000-0000-0000-0000-00000000000a', 'Conseillère Alice');
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite) values
  ('activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 'Nantes', 3500, 10)
  on conflict (id) do update set prix_unitaire_cents = 3500, capacite = 10, actif = true;  -- déjà présente si le seed est chargé
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
select doit_echouer($$insert into historique_dossier (dossier_id, type, nouveau_statut, auteur) values ('00000000-0000-0000-0000-0000000000d1', 'statut', 'validee', 'conseiller')$$, 'événement conseiller sans auteur identifié');

-- fonction de transition (E0.7) : statut et historique écrits ensemble, ou rien
select doit_valoir($$select (changer_statut('dossier', '00000000-0000-0000-0000-0000000000d1', 'nouvelle', 'fiche_en_cours', 'systeme', null) is not null)::int$$, 1, 'transition acceptée');
select doit_valoir($$select count(*) from dossiers where id = '00000000-0000-0000-0000-0000000000d1' and statut = 'fiche_en_cours'$$, 1, 'le statut du dossier a changé');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d1' and type = 'statut'
  and ancien_statut = 'nouvelle' and nouveau_statut = 'fiche_en_cours' and auteur = 'systeme'$$, 1, 'la transition a créé une ligne d''historique');
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d1', 'nouvelle', 'fiche_en_cours', 'systeme', null)$$, 'transition depuis un statut qui n''est plus le bon');
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d9', 'nouvelle', 'fiche_en_cours', 'systeme', null)$$, 'transition d''un dossier inexistant');
-- l'historique refuse un conseiller sans identifiant : le statut ne doit pas avoir changé non plus
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d1', 'fiche_en_cours', 'fiche_prete', 'conseiller', null)$$, 'transition dont l''historique est invalide');
select doit_valoir($$select count(*) from dossiers where id = '00000000-0000-0000-0000-0000000000d1' and statut = 'fiche_en_cours'$$, 1, 'historique refusé : statut inchangé');
select changer_statut('proposition', '00000000-0000-0000-0000-0000000000f1', 'brouillon_en_cours', 'brouillon_pret', 'systeme', null, '{"type": "statut", "cible": "proposition"}');
select doit_valoir($$select count(*) from historique_dossier where proposition_id = '00000000-0000-0000-0000-0000000000f1'
  and dossier_id = '00000000-0000-0000-0000-0000000000d1' and nouveau_statut = 'brouillon_pret'$$, 1, 'transition de proposition rattachée au dossier');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d1' and type = 'statut'$$, 2, 'une ligne d''historique par transition, aucune pour les refus');

-- dépôt d'une demande (E1.1) : dossier nouvelle, demande v1 et journal écrits ensemble, ou rien
select doit_valoir($$select count(*) from deposer_demande('{"consentement_rgpd": true, "consentement_ia": true, "nom": "Dépôt Test",
  "email": "depot-test@example.invalid", "date_debut": "2026-11-07", "date_fin": "2026-11-08", "nb_nuits": 1,
  "voyageurs": ["adulte", "adulte"], "budget_annonce_cents": 40000, "regimes": ["vegetarien"]}')$$, 1, 'demande valide déposée');
select doit_valoir($$select count(*) from demandes d join dossiers o on o.id = d.dossier_id
  where d.email = 'depot-test@example.invalid' and d.version = 1 and o.statut = 'nouvelle' and d.voyageurs = '{adulte,adulte}' and d.regimes = '{vegetarien}'$$, 1, 'demande en version 1, dossier au statut nouvelle');
select doit_valoir($$select count(*) from historique_dossier h join demandes d on d.dossier_id = h.dossier_id
  where d.email = 'depot-test@example.invalid' and h.nouveau_statut = 'nouvelle' and h.auteur = 'systeme'$$, 1, 'le dépôt écrit la première ligne du journal');
create temp table avant_depot as select count(*) as n from dossiers;
select doit_echouer($$select deposer_demande('{"consentement_rgpd": false, "consentement_ia": true, "nom": "Sans Accord",
  "email": "sans@example.org", "date_debut": "2026-11-07", "date_fin": "2026-11-08", "nb_nuits": 1, "voyageurs": ["adulte"]}')$$, 'demande sans consentement RGPD');
select doit_valoir($$select count(*) - (select n from avant_depot) from dossiers$$, 0, 'refus du dépôt : aucun dossier orphelin');

-- correction depuis un lien (E1.2) : lien à usage unique, expirant, deux boucles au plus
insert into dossiers (id, statut) values ('00000000-0000-0000-0000-0000000000d2', 'a_corriger'), ('00000000-0000-0000-0000-0000000000d3', 'a_corriger');
insert into demandes (id, dossier_id, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents)
  values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2', true, true, 'Nina', 'nina@example.org',
          '2026-11-07', '2026-11-08', 1, '{adulte,adulte}', 15000),
         ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d3', true, true, 'Paul', 'paul@example.org',
          '2026-11-07', '2026-11-08', 1, '{adulte}', null);
create temp table jetons as select n, encode(sha256(convert_to('jeton-test-' || n, 'UTF8')), 'hex') as h from generate_series(1, 5) n;
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d1', '{budget}', 'Budget ?',
  (select h from jetons where n = 1), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days')$$, 'correction demandée sur un dossier qui n’est pas à corriger');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d2', '{telephone}', 'Téléphone ?',
  (select h from jetons where n = 1), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days')$$, 'point à corriger inconnu');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d2', '{budget}', 'Budget ?',
  'jeton-en-clair', '00000000-0000-0000-0000-00000000000a', now() + interval '7 days')$$, 'jeton stocké en clair');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d2', '{budget}', 'Budget ?',
  (select h from jetons where n = 1), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days', '{"envies": "Précisez"}')$$, 'commentaire sur un point non signalé');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d2', '{budget}', 'Budget ?',
  (select h from jetons where n = 1), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days', jsonb_build_object('budget', repeat('x', 201)))$$, 'commentaire de plus de 200 caractères');
select doit_valoir($$select boucle from demander_correction('00000000-0000-0000-0000-0000000000d2', '{budget,dates}',
  'Votre budget paraît court pour deux personnes : pouvez-vous le préciser ?', (select h from jetons where n = 1),
  '00000000-0000-0000-0000-00000000000a', now() + interval '7 days', '{"budget": "Comptez au moins 290 € à deux."}')$$, 1, 'première correction demandée, avec un commentaire');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d2'
  and type = 'mail' and detail ->> 'type' = 'correction_demandee' and not detail ? 'motif' and not detail ? 'commentaires'$$, 1, 'la demande de correction est journalisée, sans motif ni commentaire');
select doit_valoir($$select count(*) from (select lire_correction((select h from jetons where n = 1)) l) x
  where l ->> 'etat' = 'valide' and l -> 'champs' = '["budget", "dates"]' and l -> 'demande' ->> 'nom' = 'Nina'
  and l -> 'commentaires' ->> 'budget' = 'Comptez au moins 290 € à deux.'$$, 1, 'lien valide : points à revoir, commentaires et version à préremplir');
select doit_valoir($$select count(*) from (select lire_correction(repeat('0', 64)) l) x where l ->> 'etat' = 'inconnu'$$, 1, 'lien inconnu');
select doit_valoir($$select version from corriger_demande((select h from jetons where n = 1), '{"consentement_rgpd": true, "consentement_ia": true,
  "nom": "Nina", "email": "nina@example.org", "date_debut": "2026-11-07", "date_fin": "2026-11-09", "nb_nuits": 2,
  "voyageurs": ["adulte", "adulte"], "budget_annonce_cents": 60000}')$$, 2, 'le renvoi crée la version 2');
select doit_valoir($$select count(*) from demandes where dossier_id = '00000000-0000-0000-0000-0000000000d2'
  and ((version = 1 and remplacee_le is not null) or (version = 2 and remplacee_le is null and budget_annonce_cents = 60000))$$, 2, 'version 1 marquée remplacée, version 2 courante');
select doit_valoir($$select count(*) from dossiers d join historique_dossier h on h.dossier_id = d.id
  where d.id = '00000000-0000-0000-0000-0000000000d2' and d.statut = 'fiche_en_cours'
  and h.ancien_statut = 'a_corriger' and h.nouveau_statut = 'fiche_en_cours' and h.auteur = 'systeme' and (h.detail ->> 'version')::int = 2$$, 1, 'dossier repassé en fiche_en_cours, transition journalisée');
select doit_echouer($$select corriger_demande((select h from jetons where n = 1), '{"consentement_rgpd": true, "consentement_ia": true,
  "nom": "Nina", "email": "nina@example.org", "date_debut": "2026-11-07", "date_fin": "2026-11-09", "nb_nuits": 2, "voyageurs": ["adulte"]}')$$, 'lien réutilisé');
select doit_valoir($$select count(*) from (select lire_correction((select h from jetons where n = 1)) l) x where l ->> 'etat' = 'utilise'$$, 1, 'lien déjà utilisé');
update dossiers set statut = 'a_corriger' where id = '00000000-0000-0000-0000-0000000000d2';  -- le conseiller trie de nouveau « à corriger »
select doit_valoir($$select boucle from demander_correction('00000000-0000-0000-0000-0000000000d2', '{envies}', 'Que souhaitez-vous faire ?',
  (select h from jetons where n = 2), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days')$$, 2, 'deuxième correction demandée');
select doit_valoir($$select count(*) from (select lire_correction((select h from jetons where n = 2)) l) x
  where l ->> 'etat' = 'valide' and l -> 'demande' ->> 'budget_annonce_cents' = '60000'$$, 1, 'la deuxième correction part de la version 2');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d2', '{envies}', 'Encore ?',
  (select h from jetons where n = 3), '00000000-0000-0000-0000-00000000000a', now() + interval '7 days')$$, 'troisième correction refusée');
update dossiers set statut = 'refusee' where id = '00000000-0000-0000-0000-0000000000d2';
select doit_valoir($$select count(*) from (select lire_correction((select h from jetons where n = 2)) l) x where l ->> 'etat' = 'clos'$$, 1, 'lien clos quand le dossier n’attend plus de correction');
select doit_echouer($$select corriger_demande((select h from jetons where n = 2), '{"consentement_rgpd": true, "consentement_ia": true,
  "nom": "Nina", "email": "nina@example.org", "date_debut": "2026-11-07", "date_fin": "2026-11-09", "nb_nuits": 2, "voyageurs": ["adulte"]}')$$, 'renvoi sur un dossier refusé');
select demander_correction('00000000-0000-0000-0000-0000000000d3', '{budget}', 'Budget ?', (select h from jetons where n = 4),
  '00000000-0000-0000-0000-00000000000a', now() - interval '1 minute');
select doit_valoir($$select count(*) from (select lire_correction((select h from jetons where n = 4)) l) x where l ->> 'etat' = 'expire'$$, 1, 'lien expiré');
select doit_echouer($$select corriger_demande((select h from jetons where n = 4), '{"consentement_rgpd": true, "consentement_ia": true,
  "nom": "Paul", "email": "paul@example.org", "date_debut": "2026-11-07", "date_fin": "2026-11-08", "nb_nuits": 1, "voyageurs": ["adulte"]}')$$, 'renvoi par un lien expiré');
select doit_valoir($$select count(*) from demandes where dossier_id = '00000000-0000-0000-0000-0000000000d3'$$, 1, 'refus du renvoi : aucune version créée');
select doit_echouer($$select corriger_demande((select h from jetons where n = 5), '{}')$$, 'renvoi par un lien inconnu');
-- génération de la fiche (E2.2) : fiche, statut et journal écrits ensemble ; seul un dossier en fiche_en_cours peut finir
insert into dossiers (id) values ('00000000-0000-0000-0000-0000000000d6'), ('00000000-0000-0000-0000-0000000000d7');
insert into demandes (id, dossier_id, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs)
  values ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000d6', true, true, 'Léa', 'lea@example.org', '2026-11-07', '2026-11-08', 1, '{adulte}'),
         ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000d7', true, true, 'Tom', 'tom@example.org', '2026-11-07', '2026-11-08', 1, '{adulte}');
select doit_echouer($$select terminer_generation_fiche('00000000-0000-0000-0000-0000000000d6', 'm',
  '{"envies": [], "contraintes": [], "points_flous": [], "regimes": [], "mobilite": null, "niveau_physique": null}')$$, 'génération terminée sur un dossier qui n''est pas en cours');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e6'$$, 0, 'refus : aucune fiche écrite');
select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d6', 'nouvelle', 'fiche_en_cours', 'systeme', null);
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d6', 'nouvelle', 'fiche_en_cours', 'systeme', null)$$, 'second lancement simultané refusé');
select doit_valoir($$select count(*) from terminer_generation_fiche('00000000-0000-0000-0000-0000000000d6', 'modele-test',
  '{"envies": ["atelier"], "contraintes": [], "points_flous": [], "regimes": ["sans_gluten"], "mobilite": null, "niveau_physique": null}') s
  where s = 'fiche_prete'$$, 1, 'génération réussie : fiche_prete');
select doit_valoir($$select count(*) from fiches f join dossiers d on d.id = '00000000-0000-0000-0000-0000000000d6'
  where f.demande_id = '00000000-0000-0000-0000-0000000000e6' and f.envies = '{atelier}' and f.regimes = '{sans_gluten}'
  and f.modele = 'modele-test' and d.statut = 'fiche_prete'$$, 1, 'fiche écrite et dossier fiche_prete ensemble');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d6'
  and ancien_statut = 'fiche_en_cours' and nouveau_statut = 'fiche_prete' and auteur = 'systeme'$$, 1, 'fin de génération journalisée');
select doit_echouer($$select terminer_generation_fiche('00000000-0000-0000-0000-0000000000d6', 'm',
  '{"envies": ["autre"], "contraintes": [], "points_flous": [], "regimes": [], "mobilite": null, "niveau_physique": null}')$$, 'seconde fin de génération refusée');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e6' and envies = '{atelier}'$$, 1, 'une seule fiche, inchangée');
select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d7', 'nouvelle', 'fiche_en_cours', 'systeme', null);
select doit_valoir($$select count(*) from terminer_generation_fiche('00000000-0000-0000-0000-0000000000d7', 'modele-test',
  '{"erreur": "le modèle n’a pas répondu à temps"}') s where s = 'erreur'$$, 1, 'échec après le nouvel essai : statut erreur');
select doit_valoir($$select count(*) from fiches f join dossiers d on d.id = '00000000-0000-0000-0000-0000000000d7'
  where f.demande_id = '00000000-0000-0000-0000-0000000000e7' and f.erreur_generation is not null and d.statut = 'erreur'$$, 1, 'erreur notée sur la fiche, dossier en erreur');

-- fiche (E2.1) : la correction du conseiller et la génération (E2.2) n'écrivent pas les mêmes champs
select enregistrer_generation_fiche('00000000-0000-0000-0000-0000000000e1', 'modele-1',
  '{"envies": ["atelier"], "contraintes": ["sans voiture"], "points_flous": ["une nuit ?"], "regimes": [], "mobilite": null, "niveau_physique": "faible"}');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1' and envies = '{atelier}' and erreur_generation is null$$, 1, 'génération écrite');
select corriger_fiche((select id from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'), 38000, '2026-11-07', '2026-11-08', 1, 'Rappeler mardi');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'
  and budget_reel_cents = 38000 and date_debut_fixe = '2026-11-07' and nb_nuits_fixe = 1 and notes_conseiller = 'Rappeler mardi' and envies = '{atelier}'$$, 1, 'correction écrite, contenu de l''IA intact');
select enregistrer_generation_fiche('00000000-0000-0000-0000-0000000000e1', 'modele-2',
  '{"envies": ["musée"], "contraintes": [], "points_flous": [], "regimes": ["vegetarien"], "mobilite": "reduite", "niveau_physique": null}');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'
  and envies = '{musée}' and modele = 'modele-2' and budget_reel_cents = 38000 and date_fin_fixe = '2026-11-08' and notes_conseiller = 'Rappeler mardi'$$, 1, 'une régénération n''écrase ni budget réel, ni dates fixes, ni notes');
select enregistrer_generation_fiche('00000000-0000-0000-0000-0000000000e1', 'modele-3', '{"erreur": "délai dépassé"}');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'
  and erreur_generation = 'délai dépassé' and envies = '{musée}' and budget_reel_cents = 38000$$, 1, 'un échec de génération garde la fiche et la correction');
select doit_valoir($$select count(*) from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'$$, 1, 'toujours une seule fiche par version');
select doit_echouer($$select corriger_fiche('00000000-0000-0000-0000-0000000000f9', 38000, null, null, null, null)$$, 'correction d''une fiche inexistante');
select doit_echouer($$select corriger_fiche((select id from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'), 0, null, null, null, null)$$, 'budget réel nul');
select doit_echouer($$select corriger_fiche((select id from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'), null, '2026-11-08', '2026-11-07', null, null)$$, 'dates fixes inversées');

-- tri (E3.1) : statut, journal avec la décision et fiches.decision écrits ensemble ; un seul tri gagne
insert into dossiers (id, statut) values ('00000000-0000-0000-0000-0000000000d8', 'fiche_prete'), ('00000000-0000-0000-0000-0000000000d9', 'fiche_prete');
insert into demandes (id, dossier_id, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs)
  values ('00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000d8', true, true, 'Zoé', 'zoe@example.org', '2026-11-07', '2026-11-08', 1, '{adulte}'),
         ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000d9', true, true, 'Max', 'max@example.org', '2026-11-07', '2026-11-08', 1, '{adulte}');
insert into fiches (demande_id) values ('00000000-0000-0000-0000-0000000000e8');
select doit_valoir($$select (trier_dossier('00000000-0000-0000-0000-0000000000d8', 'fiche_prete', 'validee', '00000000-0000-0000-0000-00000000000a',
  '{"type": "statut", "cible": "dossier", "ancien": "fiche_prete", "nouveau": "validee", "decision": "validee"}') is not null)::int$$, 1, 'tri validée accepté');
select doit_valoir($$select count(*) from dossiers d join demandes m on m.dossier_id = d.id join fiches f on f.demande_id = m.id
  where d.id = '00000000-0000-0000-0000-0000000000d8' and d.statut = 'validee' and f.decision = 'validee'$$, 1, 'statut validée et décision sur la fiche');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d8'
  and ancien_statut = 'fiche_prete' and nouveau_statut = 'validee' and auteur = 'conseiller'
  and auteur_id = '00000000-0000-0000-0000-00000000000a' and detail ->> 'decision' = 'validee'$$, 1, 'décision visible dans l''historique, avec le conseiller');
select doit_echouer($$select trier_dossier('00000000-0000-0000-0000-0000000000d8', 'fiche_prete', 'refusee', '00000000-0000-0000-0000-00000000000a')$$, 'second tri sur un dossier déjà trié');
select doit_valoir($$select count(*) from fiches f join demandes m on m.id = f.demande_id where m.dossier_id = '00000000-0000-0000-0000-0000000000d8' and f.decision = 'validee'$$, 1, 'second tri refusé : décision inchangée');
select doit_echouer($$select trier_dossier('00000000-0000-0000-0000-0000000000d9', 'fiche_prete', 'validee', '00000000-0000-0000-0000-00000000000a')$$, 'tri d''un dossier sans fiche');
select doit_valoir($$select count(*) from dossiers where id = '00000000-0000-0000-0000-0000000000d9' and statut = 'fiche_prete'$$, 1, 'sans fiche : statut inchangé');
select doit_valoir($$select count(*) from historique_dossier where dossier_id = '00000000-0000-0000-0000-0000000000d9'$$, 0, 'sans fiche : rien au journal');
select doit_echouer($$select trier_dossier('00000000-0000-0000-0000-0000000000d8', 'validee', 'validee', null)$$, 'tri sans conseiller identifié');

-- tarifs et envoi (E5.1) : tarif daté et sourcé, total recalculé, envoi refusé tant qu'un prix n'est pas vérifié
insert into dossiers (id, statut) values ('00000000-0000-0000-0000-0000000000da', 'en_proposition');
insert into demandes (id, dossier_id, consentement_rgpd, consentement_ia, nom, email, date_debut, date_fin, nb_nuits, voyageurs)
  values ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000da', true, true, 'Léo', 'leo@example.org', '2026-11-07', '2026-11-08', 1, '{adulte,adulte}');
insert into propositions (id, dossier_id, statut, total_cents) values ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000da', 'a_verifier', 14000);
insert into proposition_lignes (id, proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents) values
  ('00000000-0000-0000-0000-00000000a0a1', '00000000-0000-0000-0000-0000000000fa', 'activite-nantes-01', '2026-11-07', 2, 3500),
  ('00000000-0000-0000-0000-00000000a0a2', '00000000-0000-0000-0000-0000000000fa', 'activite-nantes-01', '2026-11-08', 2, 3500);
select doit_valoir($$select count(*) from changer_ligne('00000000-0000-0000-0000-00000000a0a1', 'a_verifier', 'confirme', 4000, 'telephone',
  '00000000-0000-0000-0000-00000000000a') s where s = 'a_verifier'$$, 1, 'tarif confirmé, une ligne reste à vérifier');
select doit_valoir($$select count(*) from proposition_lignes where id = '00000000-0000-0000-0000-00000000a0a1' and statut = 'confirme'
  and prix_confirme_cents = 4000 and source = 'telephone' and confirme_le is not null and confirme_par = '00000000-0000-0000-0000-00000000000a'$$, 1, 'tarif saisi avec sa date, sa source et son auteur');
select doit_valoir($$select total_cents from propositions where id = '00000000-0000-0000-0000-0000000000fa'$$, 15000, 'total recalculé (80 + 70 €)');
select doit_echouer($$select envoyer_proposition('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000000a')$$, 'envoi refusé : une ligne à vérifier');
select doit_valoir($$select count(*) from propositions where id = '00000000-0000-0000-0000-0000000000fa' and statut = 'a_verifier' and envoyee_le is null$$, 1, 'envoi refusé : statut inchangé');
select doit_echouer($$select changer_ligne('00000000-0000-0000-0000-00000000a0a1', 'a_verifier', 'confirme', 4000, 'mail', '00000000-0000-0000-0000-00000000000a')$$, 'ligne modifiée entre-temps');
select doit_echouer($$select changer_ligne('00000000-0000-0000-0000-00000000a0a2', 'a_verifier', 'confirme', null, null, '00000000-0000-0000-0000-00000000000a')$$, 'tarif confirmé sans prix ni source');
select doit_valoir($$select count(*) from changer_ligne('00000000-0000-0000-0000-00000000a0a2', 'a_verifier', 'confirme', 3500, 'agent',
  '00000000-0000-0000-0000-00000000000a') s where s = 'prete'$$, 1, 'dernière ligne confirmée : proposition prete');
select doit_valoir($$select count(*) from historique_dossier where proposition_id = '00000000-0000-0000-0000-0000000000fa'
  and ancien_statut = 'a_verifier' and nouveau_statut = 'prete' and auteur = 'systeme'$$, 1, 'passage à prete journalisé');
select enregistrer_alertes('00000000-0000-0000-0000-0000000000fa', '[{"code": "date_hors_sejour", "message": "nuit du départ"}]');
select doit_echouer($$select envoyer_proposition('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000000a')$$, 'envoi refusé : alerte bloquante');
select enregistrer_alertes('00000000-0000-0000-0000-0000000000fa', '[{"code": "budget_proche", "message": "92 %"}]');
select doit_valoir($$select (envoyer_proposition('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000000a') is not null)::int$$, 1, 'envoi accepté, alerte non bloquante');
select doit_valoir($$select count(*) from propositions p join historique_dossier h on h.proposition_id = p.id
  where p.id = '00000000-0000-0000-0000-0000000000fa' and p.statut = 'envoyee' and p.envoyee_le is not null
  and p.envoyee_par = '00000000-0000-0000-0000-00000000000a' and h.nouveau_statut = 'envoyee' and h.auteur = 'conseiller'$$, 1, 'statut envoyee, au nom du conseiller, journalisé');
select doit_echouer($$select changer_ligne('00000000-0000-0000-0000-00000000a0a1', 'confirme', 'a_verifier', null, null, '00000000-0000-0000-0000-00000000000a')$$, 'tarif modifié après l''envoi');
select doit_echouer($$select envoyer_proposition('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000000a')$$, 'second envoi');

-- remplacer une ligne indisponible (E5.2) : nouvelle ligne à vérifier au prix du catalogue, les autres lignes intactes
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite, actif) values
  ('test-remplacante-01', 'activite', 'Balade de test', 'Nantes', 2900, 12, true),
  ('test-retiree-01', 'activite', 'Atelier retiré', 'Nantes', 2000, 10, false);
insert into dossiers (id, statut) values ('00000000-0000-0000-0000-0000000000db', 'en_proposition');
insert into propositions (id, dossier_id, statut, total_cents) values ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000db', 'a_verifier', 8000);
insert into proposition_lignes (id, proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents, statut,
    prix_confirme_cents, source, confirme_le, confirme_par) values
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000fb', 'activite-nantes-01', '2026-11-07', 2, 3500, 'indisponible',
    null, null, null, null),
  ('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000fb', 'activite-nantes-01', '2026-11-08', 2, 3500, 'confirme',
    4000, 'telephone', '2026-10-20 10:00+00', '00000000-0000-0000-0000-00000000000a');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b2', 'test-remplacante-01', '00000000-0000-0000-0000-00000000000a')$$, 'remplacer une ligne confirmée');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'test-retiree-01', '00000000-0000-0000-0000-00000000000a')$$, 'remplacer par une prestation retirée');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'test-remplacante-01', null)$$, 'remplacer sans conseiller identifié');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'activite-nantes-01', '00000000-0000-0000-0000-00000000000a')$$, 'même prestation, même date');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'activite-nantes-01', '00000000-0000-0000-0000-00000000000a', '2026-11-07')$$, 'même prestation, même date donnée');
select doit_valoir($$select count(*) from proposition_lignes where proposition_id = '00000000-0000-0000-0000-0000000000fb'$$, 2, 'refus : aucune ligne créée');
create temp table remplacement as
  select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'test-remplacante-01', '00000000-0000-0000-0000-00000000000a') as id;
select doit_valoir($$select count(*) from proposition_lignes l join remplacement r on l.id = r.id
  where l.statut = 'a_verifier' and l.prestation_id = 'test-remplacante-01' and l.prix_unitaire_catalogue_cents = 2900
    and l.date = '2026-11-07' and l.participants = 2 and l.prix_confirme_cents is null$$, 1, 'nouvelle ligne à vérifier, prix du catalogue, même date et participants');
select doit_valoir($$select count(*) from proposition_lignes where id = '00000000-0000-0000-0000-00000000b0b1' and statut = 'remplacee'$$, 1, 'ancienne ligne remplacée');
select doit_valoir($$select count(*) from proposition_lignes where id = '00000000-0000-0000-0000-00000000b0b2' and statut = 'confirme'
  and prix_confirme_cents = 4000 and source = 'telephone' and confirme_par = '00000000-0000-0000-0000-00000000000a'$$, 1, 'autre ligne et son tarif confirmé intacts');
select doit_valoir($$select total_cents from propositions where id = '00000000-0000-0000-0000-0000000000fb'$$, 13800, 'total recalculé sans la ligne remplacée (80 + 58 €)');
select doit_valoir($$select count(*) from propositions where id = '00000000-0000-0000-0000-0000000000fb' and statut = 'a_verifier'$$, 1, 'proposition à vérifier');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'test-remplacante-01', '00000000-0000-0000-0000-00000000000a')$$, 'remplacer deux fois la même ligne');
select doit_echouer($$select remplacer_ligne((select id from remplacement), 'activite-nantes-01', '00000000-0000-0000-0000-00000000000a')$$, 'remplacer une ligne à vérifier');

-- RLS : un visiteur ne lit rien, un compte sans profil non plus, un conseiller lit tout
set role anon;
select doit_valoir($$select count(*) from demandes$$, 0, 'un visiteur ne lit rien');
-- tables de l'agent (E0.5) : un visiteur ne lit ni n'écrit rien
select doit_valoir($$select count(*) from verifications$$, 0, 'un visiteur ne lit pas les vérifications');
select doit_valoir($$select count(*) from options$$, 0, 'un visiteur ne lit pas les options');
select doit_echouer($$insert into verifications (ligne_id, demande_par, statut, modele, nb_tours, arret)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'echec', 'm', 0, 'echec_serveur')$$, 'vérification écrite par un visiteur');
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d1', 'fiche_en_cours', 'fiche_prete', 'systeme', null)$$, 'fonction de transition appelée par un visiteur');
select doit_echouer($$select deposer_demande('{}')$$, 'dépôt direct en base par un visiteur');
select doit_echouer($$select envoyer_proposition('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-00000000000a')$$, 'envoi appelé par un visiteur');
select doit_echouer($$select remplacer_ligne('00000000-0000-0000-0000-00000000b0b1', 'test-remplacante-01', '00000000-0000-0000-0000-00000000000a')$$, 'remplacement appelé par un visiteur');
select doit_echouer($$select trier_dossier('00000000-0000-0000-0000-0000000000d9', 'fiche_prete', 'validee', '00000000-0000-0000-0000-00000000000a')$$, 'tri appelé par un visiteur');
select doit_valoir($$select count(*) from corrections$$, 0, 'un visiteur ne lit pas les liens de correction');
select doit_echouer($$select lire_correction(repeat('0', 64))$$, 'lecture d’un lien en base par un visiteur');
select doit_echouer($$select corriger_demande(repeat('0', 64), '{}')$$, 'correction directe en base par un visiteur');
select doit_echouer($$select terminer_generation_fiche('00000000-0000-0000-0000-0000000000d7', 'm', '{}')$$, 'fin de génération appelée par un visiteur');
select doit_echouer($$select corriger_fiche('00000000-0000-0000-0000-0000000000f9', 38000, null, null, null, null)$$, 'correction de fiche par un visiteur');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
select doit_valoir($$select count(*) from demandes$$, 0, 'un compte sans profil ne lit rien');
select doit_valoir($$select count(*) from verifications$$, 0, 'un compte sans profil ne lit pas les vérifications');
select doit_valoir($$select count(*) from options$$, 0, 'un compte sans profil ne lit pas les options');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
-- compté sur les lignes du test seulement : le seed de démonstration peut être chargé
select doit_valoir($$select count(*) from demandes where id = '00000000-0000-0000-0000-0000000000e1'$$, 1, 'un conseiller lit tout');
select doit_valoir($$select count(*) from verifications where ligne_id = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'un conseiller lit les vérifications');
select doit_valoir($$select count(*) from options where ligne_id = '00000000-0000-0000-0000-0000000000a1'$$, 1, 'un conseiller lit les options');
select doit_echouer($$insert into dossiers default values$$, 'écriture directe par un conseiller');
select doit_valoir($$select count(*) from corrections where dossier_id = '00000000-0000-0000-0000-0000000000d2'$$, 2, 'un conseiller lit les liens de correction');
select doit_echouer($$select demander_correction('00000000-0000-0000-0000-0000000000d3', '{budget}', 'x', repeat('1', 64),
  '00000000-0000-0000-0000-00000000000a', now() + interval '1 day')$$, 'correction demandée en base sans passer par le serveur');
select doit_echouer($$select changer_statut('dossier', '00000000-0000-0000-0000-0000000000d1', 'fiche_en_cours', 'fiche_prete', 'systeme', null)$$, 'fonction de transition appelée par un conseiller');
select doit_echouer($$select corriger_fiche((select id from fiches where demande_id = '00000000-0000-0000-0000-0000000000e1'), 1, null, null, null, null)$$, 'correction en base directe par un conseiller (passe par le serveur)');
select doit_echouer($$select enregistrer_generation_fiche('00000000-0000-0000-0000-0000000000e1', 'm', '{}')$$, 'génération écrite par un conseiller');
-- tables de l'agent (E0.5) : seul le serveur écrit ; un conseiller connecté ne crée, ne modifie ni ne supprime rien
select doit_echouer($$insert into verifications (ligne_id, demande_par, statut, modele, nb_tours, arret)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'echec', 'm', 0, 'echec_serveur')$$, 'vérification écrite par un conseiller');
select doit_echouer($$insert into options (ligne_id, verification_id, accord_par, prix_accorde_cents)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 8000)$$, 'accord écrit par un conseiller');
-- sans politique d'écriture, update et delete ne touchent aucune ligne (pas d'erreur, 0 ligne)
select doit_valoir($$with m as (update verifications set statut = 'indisponible' returning 1) select count(*) from m$$, 0, 'aucune vérification modifiée par un conseiller');
select doit_valoir($$with m as (update options set statut = 'annulee', annulee_le = now() returning 1) select count(*) from m$$, 0, 'aucune option annulée par un conseiller');
select doit_valoir($$with m as (delete from options returning 1) select count(*) from m$$, 0, 'aucune option supprimée par un conseiller');
reset role;
rollback;
\echo TOUS LES TESTS SONT PASSÉS
