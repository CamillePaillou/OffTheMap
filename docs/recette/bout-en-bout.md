# Rejouer le cas de Sophie de bout en bout (E7.3, E7.4)

**But** : faire passer un dossier complet par toutes les briques, du formulaire au dépôt de garantie (E7.3), puis jusqu'à la réservation (E7.4), pour révéler les écarts entre elles. Critère de l'issue : le scénario se déroule **du formulaire au dépôt sans intervention technique**.

**Rejeu automatique** : [`supabase/scripts/test_bout_en_bout.sql`](../../supabase/scripts/test_bout_en_bout.sql), lancé par `make test-db` et par la CI (étape « Rejeu du cas de Sophie »). Chaque étape appelle la fonction SQL que l'application appelle à ce moment-là, avec les données de l'écran, et vérifie le statut obtenu. Tout se passe dans une transaction annulée.

Les étapes faites par le code de l'application (fiche de l'IA, brouillon, chiffrage, agent) sont remplacées par leur résultat, tel que le code l'écrit en base : le rejeu contrôle que les briques s'enchaînent, les tests unitaires contrôlent chaque brique.

## Le scénario

Sophie Martin, deux adultes, Nantes, du samedi 7 au dimanche 8 novembre 2026 (une nuit), budget 400 €, « un week-end créatif, sans voiture, avec un atelier », végétarienne.

```gherkin
Fonctionnalité: Le cas de Sophie, du formulaire à la réservation

  Scénario: Parcours complet sans intervention technique
    Étant donné le catalogue de Nantes (train 48 €, hôtel 96 €, atelier 35 €)
    Quand Sophie envoie sa demande depuis le formulaire public
    Alors un dossier est créé et sa fiche est préparée automatiquement
    Quand la conseillère valide la demande
    Et envoie le mail de rendez-vous
    Et confirme que l'entretien a eu lieu
    Et note le budget réel (400 €) et les dates fixes
    Et génère le brouillon
    Alors une proposition à 358 € attend la vérification de ses 3 prix
    Quand l'agent revérifie chaque prix (l'atelier est passé à 40 €)
    Et que la conseillère accepte les prix revérifiés
    Alors la proposition est prête, à 368 €, soit 92 % du budget
    Quand elle l'envoie et envoie le mail de la proposition
    Et que Sophie accepte, puis verse le dépôt de garantie
    Alors la proposition est au statut « dépôt reçu »
    Quand la conseillère donne son accord sur chaque ligne au prix revérifié
    Et que l'option est posée puis confirmée avec la clé d'approbation
    Alors chaque ligne est réservée, la proposition est « réservée » et le dossier « gagné »
    Et chaque changement de statut, chaque mail, accord, option et réservation est inscrit dans l'historique du dossier
```

| # | À l'écran | Brique | Fonction SQL | Statut attendu |
| --- | --- | --- | --- | --- |
| 1 | Formulaire public, « Envoyer ma demande » | E1.1 | `deposer_demande` | dossier `nouvelle` |
| 2 | (automatique, après l'envoi) | E2.2 | `changer_statut`, `terminer_generation_fiche` | `fiche_en_cours` puis `fiche_prete` |
| 3 | Fiche, « Valider » | E3.1 | `trier_dossier` | `validee` |
| 4 | Mail « Rendez-vous », « Marquer comme envoyé » | E5.4 | `marquer_mail_envoye` | `rdv_propose` |
| 5 | **« Entretien fait »** (ajouté par E7.3), puis « Après l'entretien » | E7.3, E2.1 | `changer_statut`, `corriger_fiche` | `entretien_fait`, budget réel 400 € |
| 6 | « Générer le brouillon » | E4.4 | `demarrer_brouillon` | dossier `en_proposition`, fiche validée |
| 7 | (automatique) | E4.4, E4.2 | `terminer_brouillon` | proposition `a_verifier`, 3 lignes, 358 € |
| 8 | Ligne, « Vérifier le prix » | E8.3, E8.4 | écriture dans `verifications` | 3 vérifications `ok` |
| 9 | Ligne, « Accepter (agent) » | E5.1 | `changer_ligne`, `enregistrer_alertes` | `prete`, total 368 € |
| 10 | « Envoyer au client », mail « Proposition » | E5.1, E5.4 | `envoyer_proposition`, `marquer_mail_envoye` | `envoyee`, au nom de la conseillère |
| 11 | « Le client accepte », « Dépôt reçu » | E7.1 | `enregistrer_reponse_client` | `acceptee` puis `depot_recu` |
| 12 | Écran d'accord, « Donner l'accord » | E9.3, E7.4 | `enregistrer_accord` | option `accord_donne` ; un second accord sur la ligne est refusé (OT012) ; un accord expiré est clos en `echec` |
| 13 | « Poser l'option » puis « Confirmer la réservation » (clé d'approbation) | E9.4, E9.5, E7.4 | `consommer_accord`, `terminer_pose_option`, `terminer_confirmation` | option `posee` puis `confirmee`, ligne `reservee` |
| 14 | (automatique, dernière ligne réservée) | E7.4 | `terminer_confirmation` → `changer_statut` | proposition `reservee`, dossier `gagnee` (affiché « Conclue ») |
| 15 | « Annuler la réservation » (clé d'approbation, case cochée) | E9.8, E7.4 | `terminer_annulation` | option `annulee`, ligne `confirme`, proposition `depot_recu`, dossier `en_proposition` |
| 16 | Nouvel accord, option et confirmation sur la ligne rouverte | E9.3 à E9.5 | comme 12 et 13 | tout est de nouveau réservé, dossier `gagnee` |

Contrôles de fin : toutes les lignes réservées ; historique du dossier `nouvelle > fiche_en_cours > fiche_prete > validee > rdv_propose > entretien_fait > en_proposition > gagnee > en_proposition > gagnee` ; historique de la proposition `brouillon_en_cours > brouillon_pret > a_verifier > prete > envoyee > acceptee > depot_recu > reservee > depot_recu > reservee` ; 5 accords, 5 événements d'option (4 poses, 1 annulation) et 4 réservations tracés ; deux mails tracés.

## Écarts révélés par le rejeu

| Écart | Effet | Correction |
| --- | --- | --- |
| Aucun écran ne faisait passer le dossier de `rdv_propose` à `entretien_fait` | Le brouillon (E4.4) n'était accessible qu'en modifiant la base à la main : le scénario s'arrêtait à l'étape 5 | Bouton **« Entretien fait »** dans le bloc « Maintenant » de la fiche (action `entretienFait`, par la fonction de transition) |
| La fusion du design avec E6.4 avait cassé `app/conseiller/page.tsx` (balises non fermées, ancien tableau mêlé au nouveau) | `dev` ne compilait plus : l'espace conseiller ne s'ouvrait pas | Corrigé par #197 : accueil reconstruit, rappels « Clients à relancer » (E6.4) dans le style du back-office |
| Une proposition `sans_reponse` affichait « Client · Attendre la réponse » | Le conseiller ne voyait pas qu'il devait relancer | Prochaine étape « À vous · Relancer le client » |

## Correctifs d'intégration (E7.4)

| Écart | Effet | Correction |
| --- | --- | --- |
| L'écran d'accord lisait la proposition de démonstration (fixtures) | Depuis une vraie proposition au dépôt reçu, le lien « Passer à la réservation » menait à une page introuvable : le parcours s'arrêtait au dépôt | La page et les actions relisent la proposition en base (`PropositionsSupabase`) |
| Accords, options et réservations gardés en mémoire du serveur | Perdus au redémarrage, absents de `options` et de l'historique du dossier ; aucune garantie d'une seule démarche par ligne entre deux serveurs | Adaptateur `AccordsSupabase` et fonctions SQL (migration `20261022090000_accord_option_reservation.sql`) : écriture et journal dans la même transaction |
| La confirmation ne faisait pas avancer les statuts | Ligne restée `confirme`, proposition jamais `reservee`, dossier jamais `gagnee` | `terminer_confirmation` passe la ligne à `reservee`, puis la proposition et le dossier quand la dernière ligne est réservée (transitions système de `types/transitions.ts`) |
| Un accord ou une option expiré bloquait la ligne (index unique) | Impossible de redonner un accord après une option expirée | `enregistrer_accord` clôt d'abord les démarches périmées de la ligne (`echec`, `expiree`) |
| L'annulation d'une réservation (E9.8) écrivait elle aussi en mémoire | Annulation perdue au redémarrage, absente de l'historique | Fonction SQL `terminer_annulation` : option `annulee` au nom du conseiller (étapes 15 et 16 du rejeu) |
| Après une annulation, la ligne restait `reservee`, la proposition `reservee` et le dossier « Conclu » | Le mail de confirmation aurait annoncé au client une prestation annulée, et aucun nouvel accord n'était possible malgré le message « un nouvel accord reste possible » | Transitions système ajoutées (`types/transitions.ts`, `docs/specs/transitions.md`) : ligne `reservee → confirme`, proposition `reservee → depot_recu`, dossier `gagnee → en_proposition` |
| Dans l'historique du dossier, tout événement d'option s'affichait « Option posée » | Une annulation, un échec ou une tentative refusée passaient pour une option posée | `resumeEvenement` donne un libellé à chaque cas (pose, confirmation, annulation, réussies ou non, tentatives refusées) |
| Le statut `gagnee` s'affichait « Gagnée » | Libellé peu parlant pour la conseillère | Affiché « Conclue » (`libelles.ts`) ; la valeur en base ne change pas |
| Une prestation devenue indisponible après le dépôt bloquait tout (aucune action de ligne après l'acceptation) | Impossible de réserver le reste, ni de remplacer ou retirer la prestation | Après le dépôt : marquer indisponible, remplacer ou retirer avec l'accord du client coché ; nouveau statut de ligne `retiree` (`docs/specs/indisponible-apres-depot.md`, test `test_indisponible_apres_depot.sql`) |
| Sur une proposition réservée, la page de la proposition proposait encore le mail « Proposition » | Le conseiller aurait renvoyé au client une demande d'acceptation | Mail « Confirmation de réservation », comme sur la fiche du dossier |
| Une proposition réservée n'affichait plus rien à droite | Plus d'accès au récapitulatif des réservations | Encadré « Toutes les prestations sont réservées » avec lien vers l'écran |

## Hors du périmètre
- **Mode réel** : le rejeu ne contacte ni le modèle ni le simulateur. Les essais réels restent `make essai-llm` et `make essai-agent`.
