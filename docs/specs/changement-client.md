# Changement demandé par le client (E6.1)

**Règle** : la version envoyée ne change jamais ; la suivante porte le numéro suivant. Cas d'usage : `src/application/changementClient.ts`. Base : `supabase/migrations/20261020220000_version_suivante.sql`. Écran : panneau « Le client demande un changement » sur une proposition envoyée.

```gherkin
Scénario : version envoyée intacte
  Étant donné une proposition envoyée en version 1
  Quand le client demande un changement
  Alors la version 2 est créée et la version 1 reste inchangée
```

## Ce qui se passe, dans une seule transaction (`creer_version_suivante`)

| Étape | Version envoyée (v1) | Version suivante (v2) |
| --- | --- | --- |
| 1 | `envoyee → changement_demande`, au nom du conseiller | — |
| 2 | — | créée en `brouillon_en_cours`, numéro suivant, avec le motif du changement |
| 3 | `changement_demande → remplacee` (garde : v2 en `brouillon_en_cours`) | — |
| 4 | — | écrite par `terminer_brouillon` (E4.4) : lignes `a_verifier`, programme, total et alertes, puis `brouillon_pret → a_verifier` |

La v1 garde ses lignes (statuts et prix confirmés), son programme, son total, ses alertes et sa date d'envoi : seul son statut change. Deux clics simultanés ou une acceptation entre-temps : refus `OT002`, rien n'est écrit.

## Contenu de la version suivante

- Programme de la v1, repris tel quel.
- Lignes retenues dans la v1 (ni `remplacee` ni `indisponible`), avec de **nouveaux identifiants**, au **prix actuel du catalogue** et **sans prix confirmé** : tout repart « à vérifier » (vérification par l'agent E8.4, tarifs E5.1).
- Total et alertes recalculés par le code (`chiffrer`, E4.2) avec les valeurs de référence actuelles du dossier (fiche corrigée, sinon demande).
- `motif_changement` : ce que le client a demandé, obligatoire (1 000 caractères au plus), affiché en tête de la v2.

## Transitions livrées

`envoyee → changement_demande` (conseiller) et `changement_demande → remplacee` (système) passent de *should* à *must* (`types/transitions.ts`, `docs/specs/transitions.md`). `sans_reponse → changement_demande` reste *should* : l'état `sans_reponse` (rappels, E6.4) n'est pas encore livré.

## Contrat du dashboard

`Proposition` (`types/dashboard.ts`) gagne `motif_changement` (`null` sauf sur une version qui répond à un changement). Fixtures mises à jour.

## Tests

`src/application/changementClient.test.ts` (reprise des lignes au prix actuel, total et alertes recalculés, v1 non modifiée, motif, statuts refusés, concurrence) ; `supabase/scripts/test_contraintes.sql` (v1 intacte, v2 numéro suivant avec motif, journal, second changement refusé, droits).
