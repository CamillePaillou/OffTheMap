# Rappels quand le client ne répond pas (E6.4)

**Règle** : une proposition envoyée sans réponse du client donne un rappel au conseiller à **J+3** (elle passe en `sans_reponse`), puis à **J+7**. Règle : `src/domain/rappels.ts`. Cas d'usage : `src/application/rappels.ts`. Base : `supabase/migrations/20261021090000_rappels_sans_reponse.sql`. Écrans : accueil de l'espace conseiller, page de la proposition.

```gherkin
Scénario : rappel à J+3 puis à J+7
  Étant donné une proposition envoyée le 15 octobre à 11 h
  Quand le conseiller ouvre son espace le 18 octobre à 11 h, sans réponse du client
  Alors la proposition passe en sans_reponse et un rappel J+3 est journalisé
  Et le 22 octobre à 11 h, un rappel J+7 est journalisé, sans autre changement de statut
```

## Quand un rappel est posé

- Les jours sont des **jours pleins (24 h)** comptés depuis `envoyee_le`, week-ends compris.
- Pas de tâche planifiée (ADR-0005) : les rappels dus sont posés par le code **à l'ouverture de l'espace conseiller** (`/conseiller`). Un rappel peut donc être journalisé après son jour, au premier passage d'un conseiller.
- Seul le jour atteint le plus tardif compte : une proposition restée 8 jours sans passage reçoit le rappel J+7, pas J+3 puis J+7 d'un coup.
- Une proposition acceptée, ou remplacée après un changement, n'attend plus de réponse : plus aucun rappel.

## Ce qui s'écrit, dans une seule transaction (`enregistrer_rappel`)

| Rappel | Statut de la proposition | Journal (`historique_dossier`, auteur système) |
| --- | --- | --- |
| J+3 | `envoyee → sans_reponse` (par `changer_statut`) | statut, puis `{"type": "rappel", "jour": 3}` |
| J+7 | inchangé (`sans_reponse`) | `{"type": "rappel", "jour": 7}` |

Refus, rien n'est écrit : proposition plus en `envoyee` ni `sans_reponse`, ou rappel (ou un plus tardif) déjà fait (`OT002`) ; rappel avant son jour (`OT012`) ; jour autre que 3 ou 7 (`OT003`). Un index unique garantit un seul rappel par jour et par proposition, même si deux écrans s'ouvrent en même temps. Réservée au serveur (`service_role`).

Le rappel J+14 (proposition d'abandon) est E6.5.

## Ce que voit le conseiller

- **Accueil** : encadré « Clients à relancer » avec, pour chaque proposition `sans_reponse`, le client, la version, la date d'envoi, les jours écoulés et le dernier rappel ; lien vers la proposition.
- **Proposition** : bandeau « Sans réponse du client » ; le mail de la proposition reste ouvert pour relancer le client depuis sa messagerie (E5.4) ; les panneaux « Enregistrer l'acceptation » (E7.1) et « Le client demande un changement » (E6.1) restent proposés.
- **Fiche du dossier** : l'historique affiche « Rappel J+3 : pas de réponse du client à la proposition ».

Aucun mail ne part de l'application : le conseiller relance lui-même le client.

## Transitions livrées

`envoyee → sans_reponse` (système), `sans_reponse → acceptee` et `sans_reponse → changement_demande` (conseiller) passent de *should* à *must* (`types/transitions.ts`, `docs/specs/transitions.md`). La base les acceptait déjà (`enregistrer_reponse_client`, `creer_version_suivante`, `marquer_mail_envoye`).

## Contrats

Aucun changement des payloads du dashboard (`types/dashboard.ts`). Le type d'événement `rappel` et son détail `{ type: 'rappel'; jour: 3 | 7 | 14 }` existaient déjà (`types/historique.ts`).

## Tests

`src/application/rappels.test.ts` (jours pleins, J+3, J+7, rattrapage à J+8, rien après une réponse, concurrence, libellé de l'historique) ; `src/application/changementClient.test.ts` (changement depuis `sans_reponse`) ; `supabase/scripts/test_contraintes.sql` (rappel avant son jour, J+3 et son statut, J+7 sans changement de statut, doublons, proposition acceptée, acceptation depuis `sans_reponse`, droits).
