# Payloads du dashboard conseiller (E0.12)

Contrat des trois réponses lues par le back-office. Source unique : les schémas Zod de `types/dashboard.ts`.
Les fixtures de `fixtures/dashboard/` les suivent et sont validées par `types/dashboard.test.ts` ; un écran les importe depuis `fixtures/dashboard` pour s'afficher sans la base.

| Route (à venir) | Schéma | Fixture | Écrans |
| --- | --- | --- | --- |
| `GET /api/dossiers?limit&offset` | `ListeDossiers` | `liste-dossiers.json` (5 dossiers, statuts variés) | E2.1 |
| `GET /api/dossiers/{id}` | `DetailDossier` | `detail-dossier.json` (Sophie, Nantes, en proposition) | E2.1, E3.1 |
| `GET /api/propositions/{id}` | `Proposition` | `proposition.json` (exemple B des règles de chiffrage) | E4.5, E8.4, E9.3 |

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
