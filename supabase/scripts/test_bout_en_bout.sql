-- Rejouer le cas de Sophie de bout en bout (E7.3), du formulaire au dépôt reçu.
--
-- Chaque étape appelle la fonction SQL que l'application appelle à ce moment-là (adaptateurs de src/infrastructure/db),
-- avec les mêmes données qu'à l'écran. Le scénario est décrit pas à pas dans docs/recette/bout-en-bout.md.
-- Les étapes faites par le code de l'application (fiche de l'IA, brouillon, chiffrage, agent) sont remplacées par
-- leur résultat, tel que le code l'écrit en base. Tout se passe dans une transaction annulée : la base ne change pas.
--
-- Lancement : après les migrations (make test-db, CI). Le catalogue est créé s'il manque.
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

-- la conseillère et le catalogue de Nantes (déjà là si le seed est chargé)
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000e2e01');
insert into profils values ('00000000-0000-4000-8000-0000000e2e01', 'Conseillère du rejeu');
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite) values
  ('train-nantes-01', 'transport', 'Train Paris – Nantes', 'Nantes', 4800, 8),
  ('hotel-nantes-01', 'hebergement', 'Hôtel de la gare', 'Nantes', 9600, 8),
  ('activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 'Nantes', 3500, 10)
  on conflict (id) do nothing;
\set conseillere '00000000-0000-4000-8000-0000000e2e01'

-- 1. Sophie dépose sa demande depuis le formulaire public (E1.1)
select dossier_id as dossier, demande_id as demande from deposer_demande($${
  "consentement_rgpd": true, "consentement_ia": true,
  "nom": "Sophie Martin", "email": "sophie.rejeu@example.org", "destination": "Nantes",
  "date_debut": "2026-11-07", "date_fin": "2026-11-08", "nb_nuits": 1,
  "voyageurs": ["adulte", "adulte"], "budget_annonce_cents": 40000,
  "envies": "Un week-end créatif, sans voiture, avec un atelier.",
  "contraintes": "Arriver avant midi le samedi.", "regimes": ["vegetarien"], "mobilite": null
}$$::jsonb) \gset
select etape('1. demande déposée, dossier nouveau', format('select statut::text from dossiers where id = %L', :'dossier'), 'nouvelle');

-- 2. La fiche est préparée automatiquement (E2.2) : nouvelle → fiche_en_cours, puis le résultat validé du modèle
select changer_statut('dossier', :'dossier', 'nouvelle', 'fiche_en_cours', 'systeme', null,
  '{"type": "statut", "cible": "dossier", "ancien": "nouvelle", "nouveau": "fiche_en_cours"}');
select etape('2. fiche prête', format($q$select terminer_generation_fiche(%L, 'modele-du-rejeu', %L)::text$q$, :'dossier',
  '{"envies": ["atelier créatif", "découverte de la ville à pied"], "contraintes": ["pas de voiture", "arrivée avant midi le samedi"],
    "points_flous": [], "regimes": ["vegetarien"], "mobilite": null, "niveau_physique": "faible"}'), 'fiche_prete');

-- 3. La conseillère trie la demande : validée (E3.1)
select trier_dossier(:'dossier', 'fiche_prete', 'validee', :'conseillere');
select etape('3. demande validée', format('select statut::text from dossiers where id = %L', :'dossier'), 'validee');

-- 4. Elle envoie le mail de rendez-vous et le marque envoyé (E5.4)
select marquer_mail_envoye(:'dossier', null, 'rendez_vous', :'conseillere');
select etape('4. rendez-vous proposé', format('select statut::text from dossiers where id = %L', :'dossier'), 'rdv_propose');

-- 5. Après l'entretien : bouton « Entretien fait » (ajouté par E7.3), puis budget réel et dates fixes (E2.1)
select changer_statut('dossier', :'dossier', 'rdv_propose', 'entretien_fait', 'conseiller', :'conseillere',
  '{"type": "statut", "cible": "dossier", "ancien": "rdv_propose", "nouveau": "entretien_fait"}');
select f.id as fiche from fiches f join demandes d on d.id = f.demande_id where d.dossier_id = :'dossier' \gset
select corriger_fiche(:'fiche', 40000, '2026-11-07', '2026-11-08', 1, 'Préfère un hôtel proche de la gare.');
select etape('5. entretien fait, fiche corrigée', format('select statut::text || '' '' || budget_reel_cents from dossiers d
  join demandes de on de.dossier_id = d.id join fiches f on f.demande_id = de.id where d.id = %L', :'dossier'), 'entretien_fait 40000');

-- 6. « Générer le brouillon » (E4.4) : la fiche est validée, le dossier passe en proposition
select demarrer_brouillon(:'dossier', :'conseillere') as proposition \gset
select etape('6. dossier en proposition, fiche validée', format('select d.statut::text || '' '' || (f.validee_par is not null) from dossiers d
  join demandes de on de.dossier_id = d.id join fiches f on f.demande_id = de.id where d.id = %L', :'dossier'), 'en_proposition true');

-- 7. Le brouillon arrive : programme sans montant, lignes au prix du catalogue, total et alertes calculés par le code (E4.2)
select gen_random_uuid() as ligne_train, gen_random_uuid() as ligne_hotel, gen_random_uuid() as ligne_atelier \gset
select etape('7. brouillon prêt, prix à vérifier', format('select terminer_brouillon(%L, %L)::text', :'proposition', jsonb_build_object(
  'programme', '[{"date": "2026-11-07", "titre": "Arrivée et atelier", "texte": "Train le matin, atelier l''après-midi, nuit à l''hôtel."},
                 {"date": "2026-11-08", "titre": "Balade et retour", "texte": "Matinée libre, retour en train."}]'::jsonb,
  'total_cents', 35800,
  'alertes', '[]'::jsonb,
  'lignes', jsonb_build_array(
    jsonb_build_object('id', :'ligne_train', 'prestation_id', 'train-nantes-01', 'date', '2026-11-07', 'participants', 2, 'prix_unitaire_catalogue_cents', 4800),
    jsonb_build_object('id', :'ligne_hotel', 'prestation_id', 'hotel-nantes-01', 'date', '2026-11-07', 'participants', 2, 'prix_unitaire_catalogue_cents', 9600),
    jsonb_build_object('id', :'ligne_atelier', 'prestation_id', 'activite-nantes-01', 'date', '2026-11-07', 'participants', 2, 'prix_unitaire_catalogue_cents', 3500))
)), 'a_verifier');

-- 8. L'agent revérifie chaque ligne (E8.3, E8.4) : résultat écrit par le serveur ; l'atelier est passé à 40 €
insert into verifications (ligne_id, demande_par, statut, prix_unitaire_cents, prix_total_cents, places_restantes, modele, nb_tours, arret, resume) values
  (:'ligne_train', :'conseillere', 'ok', 4800, 9600, 8, 'modele-du-rejeu', 2, 'conclusion', 'Disponible pour le groupe.'),
  (:'ligne_hotel', :'conseillere', 'ok', 9600, 19200, 6, 'modele-du-rejeu', 2, 'conclusion', 'Disponible pour le groupe.'),
  (:'ligne_atelier', :'conseillere', 'ok', 4000, 8000, 6, 'modele-du-rejeu', 2, 'conclusion', 'Disponible ; le tarif a augmenté.');
select etape('8. trois vérifications enregistrées', format('select count(*)::text from verifications v join proposition_lignes l on l.id = v.ligne_id
  where l.proposition_id = %L and v.statut = ''ok''', :'proposition'), '3');

-- 9. La conseillère accepte les prix revérifiés (E5.1) : la proposition devient prête, total recalculé en base
select changer_ligne(:'ligne_train', 'a_verifier', 'confirme', 4800, 'agent', :'conseillere');
select changer_ligne(:'ligne_hotel', 'a_verifier', 'confirme', 9600, 'agent', :'conseillere');
select etape('9. dernière ligne confirmée : proposition prête',
  format($q$select changer_ligne(%L, 'a_verifier', 'confirme', 4000, 'agent', %L)::text$q$, :'ligne_atelier', :'conseillere'), 'prete');
select etape('9. total recalculé avec le prix revérifié', format('select total_cents::text from propositions where id = %L', :'proposition'), '36800');
-- alertes recalculées par le code après le changement (92 % du budget : non bloquante)
select enregistrer_alertes(:'proposition', '[{"code": "budget_proche", "message": "Total 368,00 €, soit 92 % du budget de 400,00 €"}]');

-- 10. Envoi au client (E5.1) puis mail de la proposition (E5.4)
select envoyer_proposition(:'proposition', :'conseillere');
select marquer_mail_envoye(:'dossier', :'proposition', 'proposition', :'conseillere');
select etape('10. proposition envoyée au nom de la conseillère', format('select statut::text || '' '' || (envoyee_par = %L) from propositions where id = %L',
  :'conseillere', :'proposition'), 'envoyee true');

-- 11. Sophie accepte, puis le dépôt de garantie est reçu (E7.1)
select enregistrer_reponse_client(:'proposition', 'acceptee', :'conseillere');
select enregistrer_reponse_client(:'proposition', 'depot_recu', :'conseillere');
select etape('11. dépôt reçu', format('select statut::text from propositions where id = %L', :'proposition'), 'depot_recu');

-- Fin : le parcours est complet et entièrement tracé
select etape('fin : dossier toujours en proposition (réservation hors E7.3)', format('select statut::text from dossiers where id = %L', :'dossier'), 'en_proposition');
select etape('fin : aucune ligne à vérifier', format($q$select count(*)::text from proposition_lignes where proposition_id = %L and statut <> 'confirme'$q$, :'proposition'), '0');
select etape('fin : chaque statut du dossier est journalisé, dans l''ordre', format($q$
  select string_agg(nouveau_statut, ' > ' order by id) from historique_dossier
  where dossier_id = %L and type = 'statut' and proposition_id is null$q$, :'dossier'),
  'nouvelle > fiche_en_cours > fiche_prete > validee > rdv_propose > entretien_fait > en_proposition');
select etape('fin : chaque statut de la proposition est journalisé, dans l''ordre', format($q$
  select string_agg(nouveau_statut, ' > ' order by id) from historique_dossier
  where proposition_id = %L and type = 'statut'$q$, :'proposition'),
  'brouillon_en_cours > brouillon_pret > a_verifier > prete > envoyee > acceptee > depot_recu');
select etape('fin : deux mails tracés', format($q$select count(*)::text from historique_dossier where dossier_id = %L and type = 'mail'$q$, :'dossier'), '2');

\o
\echo 'REJEU OK : le cas de Sophie va du formulaire au dépôt reçu sans intervention technique.'
rollback;
