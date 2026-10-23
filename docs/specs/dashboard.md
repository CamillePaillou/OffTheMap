# Payloads du dashboard conseiller (E0.12)

Contrat des trois réponses lues par le back-office. Source unique : les schémas Zod de `types/dashboard.ts`.
Les fixtures de `fixtures/dashboard/` les suivent et sont validées par `types/dashboard.test.ts` ; un écran les importe depuis `fixtures/dashboard` pour s'afficher sans la base.

| Route (à venir) | Schéma | Fixture | Écrans |
| --- | --- | --- | --- |
| `GET /api/dossiers?limit&offset` | `ListeDossiers` | `liste-dossiers.json` (5 dossiers, statuts variés) | E2.1 |
| `GET /api/dossiers/{id}` | `DetailDossier` | `detail-dossier.json` (Sophie, Nantes, en proposition) | E2.1, E3.1 |
| `GET /api/propositions/{id}` | `Proposition` (dont `programme`, texte du brouillon E4.4, et `motif_changement`, E6.1) | `proposition.json` (exemple B des règles de chiffrage) | E4.5, E8.4, E9.3 |
| `GET /api/lignes/{id}/verification` | `VerificationLigne` | `verifications.json` (atelier revérifié à 40 €, hôtel en échec) | E8.4, E9.3 |

Principes (plan, section 5.2) : montants en centimes ; valeur indisponible = `null`, jamais `0` ; pagination par `limit` et `offset` ; dates en UTC ISO-8601 ; aucun champ en trop (schémas stricts).

## Écarts avec la proposition de la section 5.2

Alignés sur le schéma de la base et les types partagés ; à valider par P3.

| Section 5.2 | Ici | Pourquoi |
| --- | --- | --- |
| `fiche.statut: "fiche_prete"` | `fiche.etat` : `en_cours`, `prete`, `erreur`, `validee` | `fiches` n'a pas de statut ; `fiche_prete` est un statut du dossier. L'état se déduit de `erreur_generation` et `validee_le`. |
| `voyageurs: [{ "age": 34 }]` | `voyageurs: ["adulte", "adulte"]` | la base ne garde que les tranches d'âge (`tranche_age[]`). |
| `prestataire` | `prestation` (+ `capacite`, `actif`) | nom de la table ; capacité et activité expliquent les alertes. |
| `tarif_confirme_cents` | `prix_confirme: { montant_cents, source, le, par }` | colonnes `prix_confirme_cents`, `source`, `confirme_le`, `confirme_par`, toujours renseignées ensemble. |
| `marge_cents: null` | `marge_cents: 0` | marge décidée à 0 (`REGLES_CHIFFRAGE`) : c'est une valeur connue, pas indisponible. |
| alerte `budget_proche` à 35 800 / 40 000 | aucune alerte à 89,5 % | le seuil est 90 % ; la fixture reprend l'exemple B (36 800, alerte `budget_proche`). |
| — | `client.nom` (liste), `client` complet (détail) | le conseiller doit savoir qui il rappelle ; jamais envoyé au LLM. |
| — | `budget_reference_cents`, `derniere_verification` par ligne | budget utilisé pour les alertes ; résultat de l'agent pour E8.4. |
| — | `historique[].cible`, `auteur_nom` | savoir quelle machine (dossier ou proposition) a changé, et quel conseiller. |

## Dossiers et fiche (E2.1)

Écrans : `/conseiller` (liste des dossiers, `ListeDossiers`) et `/conseiller/dossiers/{id}` (`DetailDossier`), lus en base au nom du conseiller connecté (RLS `lecture_conseiller`, adaptateur `src/infrastructure/db/dossiersSupabase.ts`).
L'état de la fiche se déduit du statut du dossier et de la fiche (`src/domain/etatFiche.ts`) : `fiche_en_cours` et `erreur` l'emportent sur une fiche précédente.

Champs de la fiche et qui les écrit :

| Champs | Écrits par | Fonction SQL |
| --- | --- | --- |
| `envies`, `contraintes`, `points_flous`, `regimes`, `mobilite`, `niveau_physique`, `modele`, `erreur_generation` | la génération (E2.2) | `enregistrer_generation_fiche(demande_id, modele, generation)` |
| `budget_reel_cents`, `date_debut_fixe`, `date_fin_fixe`, `nb_nuits_fixe`, `notes_conseiller` | le conseiller, après l'entretien | `corriger_fiche(...)`, via le cas d'usage `corrigerFiche` |

Une régénération ne liste pas les champs du conseiller : budget réel, dates fixes, notes, décision et validation restent (tests dans `supabase/scripts/test_contraintes.sql`). E2.2 doit écrire la fiche par `enregistrer_generation_fiche`, jamais par un `insert`/`update` direct. Les deux fonctions ne sont appelables que par le serveur (`service_role`).

Bouton « relancer » : affiché quand le dossier est au statut `erreur` ; transition `erreur → fiche_en_cours` au nom du conseiller (cas d'usage `relancerFiche`, fonction `changer_statut`). La génération elle-même sera lancée là par E2.2.

## Vérification d'une ligne (E8.4)

`VerificationLigne` reprend une ligne de `verifications` : prix revérifié (unitaire et total), places, résumé de l'agent, `reponse_serveur` (réponse du simulateur telle que rendue par l'adaptateur, en centimes : c'est ce que `verifierPrestation` enregistre), `trace` (format `TraceVerification` de E8.5, `types/trace.ts`) et raison d'arrêt.
L'écart avec le prix proposé n'est pas dans le payload : il est calculé par le code (`src/domain/ecartPrix.ts`), jamais par le modèle.
Écrans : `/conseiller/propositions/{id}` (ouvert depuis la fiche du dossier) (prix proposé, revérifié et écart par ligne) et `/conseiller/propositions/{id}/lignes/{ligneId}` (réponse brute et trace). Ils lisent la base au nom du conseiller (`src/infrastructure/db/propositionsSupabase.ts`).
Le bouton « Vérifier le prix » / « Revérifier » de l'écran d'une ligne lance `verifierPrestation(ligne, { modele, prestataires, secrets })` (E8.3) par le cas d'usage `reverifierLigne` : l'agent ne reçoit que prestation, nom, date et participants ; le résultat (prix, places, réponse, trace expurgée, `resume`) est écrit dans `verifications` avec la clé service_role. Il faut `LLM_API_KEY`, `LLM_MODEL` et `SIMULATEUR_TEAM_KEY` dans `.env` (voir `.env.example`).

## Relire une proposition (E4.5)

Écran `/conseiller/propositions/{id}`, ouvert depuis la fiche du dossier (lien « ← Fiche du dossier » pour y revenir). Le conseiller y relit avant l'envoi :

- le **statut** en clair, le **total** et sa part du **budget de référence** (réel, sinon annoncé), en pourcentage tronqué : 89,9 % s'affiche 89 %, jamais arrondi au-dessus du seuil de 90 % ;
- le **programme** du brouillon (E4.4) ;
- par ligne : prix catalogue, **total de la ligne** (prix confirmé, sinon catalogue, × participants ; barré si la ligne est hors total), et les **alertes de la ligne** ;
- la liste des **alertes**, avec leur libellé et, en rouge, celles qui bloquent l'envoi (`ALERTES_BLOQUANTES`).

Rien n'est calculé par l'écran : total et alertes viennent du chiffrage (E4.2), recalculés depuis la base tant que la proposition est modifiable (E5.1). La mise en forme est préparée par `src/domain/proposition/resumeProposition.ts`.
