# Abandonner un dossier sans réponse (E6.5)

**Règle** : à **J+14** après l'envoi d'une proposition restée sans réponse, l'abandon du dossier est **proposé** au conseiller (rappel J+14). Le dossier passe en `abandonnee` **seulement après sa confirmation**. Règle : `src/domain/rappels.ts` (`abandonPropose`). Cas d'usage : `src/application/abandonDossier.ts`. Base : `supabase/migrations/20261022140000_abandon_sans_reponse.sql`. Écrans : accueil de l'espace conseiller, page de la proposition.

```gherkin
Scénario : abandon proposé à J+14, confirmé par le conseiller
  Étant donné une proposition envoyée le 1er octobre à 11 h, passée en sans_reponse (E6.4)
  Quand le conseiller ouvre son espace le 15 octobre à 11 h, toujours sans réponse du client
  Alors un rappel J+14 est journalisé et l'abandon du dossier lui est proposé, sans changement de statut
  Quand il coche « Le client n'a pas répondu malgré les relances » et clique « Abandonner le dossier »
  Alors le dossier passe de en_proposition à abandonnee, journalisé à son nom
  Et la proposition reste sans_reponse, telle qu'elle a été envoyée
```

## Proposition d'abandon (rappel J+14)

Le rappel J+14 suit les règles des rappels J+3 et J+7 (`docs/specs/rappels.md`) : jours pleins depuis `envoyee_le`, posé à l'ouverture de l'espace conseiller, seul le jour atteint le plus tardif compte. Il ne change aucun statut. `enregistrer_rappel` accepte désormais les jours 3, 7 et 14.

## Ce qui s'écrit à la confirmation (`abandonner_dossier`, une seule transaction)

| Dossier | Proposition | Journal (`historique_dossier`) |
| --- | --- | --- |
| `en_proposition → abandonnee` (par `changer_statut`, auteur conseiller) | inchangée (`sans_reponse`) | statut du dossier, au nom du conseiller |

Le cas d'usage exige la case de confirmation cochée (`non_confirme` sinon), une proposition `sans_reponse` et un dossier `en_proposition` (`transition_interdite`), et 14 jours pleins depuis l'envoi (`trop_tot`).

Refus en base, rien n'est écrit : proposition plus `sans_reponse` ou dossier plus `en_proposition` (`OT002` : réponse, changement ou abandon enregistré entre-temps) ; avant J+14 (`OT012`) ; sans conseiller (`OT003`). Réservée au serveur (`service_role`).

## Un dossier abandonné est clos

Un déclencheur sur `propositions` refuse (`OT002`) toute création de proposition et tout changement de statut d'une proposition dont le dossier est `abandonnee` : ni acceptation, ni changement, ni nouvelle version après coup.

## Ce que voit le conseiller

- **Accueil** : dans « Clients à relancer », la mention « abandon proposé » à côté du rappel J+14. Un dossier abandonné sort de la liste.
- **Proposition, à J+14** : bandeau « Sans réponse du client depuis au moins 14 jours » et panneau repliable « Abandonner le dossier » (case de confirmation, bouton). Les panneaux « Enregistrer l'acceptation » et « Le client demande un changement » restent proposés.
- **Proposition, dossier abandonné** : bandeau « Dossier abandonné » ; plus aucun panneau d'action, le mail n'est plus ouvert d'office.
- **Fiche du dossier** : « Dossier clos : abandonnée » ; l'historique affiche « Rappel J+14 : pas de réponse du client, abandon du dossier proposé » puis le changement de statut.

## Transitions livrées

`en_proposition → abandonnee` (conseiller) passe de *could* à *must*, avec la garde « proposition sans_reponse envoyée depuis 14 jours » (`types/transitions.ts`, `docs/specs/transitions.md`). Les autres abandons (`a_corriger`, `validee`, `rdv_propose`, `entretien_fait`) restent *could*.

## Contrats

Aucun changement des payloads du dashboard (`types/dashboard.ts`). Le détail `{ type: 'rappel'; jour: 14 }` existait déjà (`types/historique.ts`). Nouvelle fonction SQL `abandonner_dossier` (`types/database.ts`).

## Tests

`src/application/abandonDossier.test.ts` (J+14 pleins, confirmation, trop tôt, statuts refusés, conseiller non identifié, concurrence) ; `src/application/rappels.test.ts` (rappel J+14, libellé de l'historique) ; `supabase/scripts/test_contraintes.sql` (rappel J+14 avant son jour et sans changement de statut, abandon avant J+14, sans conseiller, journalisé, deux fois, acceptation et nouvelle version refusées sur un dossier abandonné, droits).
