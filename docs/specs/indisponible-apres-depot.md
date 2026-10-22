# Prestation indisponible après le dépôt (E7.4)

**Règle** : sur une proposition au **dépôt reçu**, une prestation pas encore réservée peut devenir indisponible (complète, fermée). Le conseiller la marque indisponible, puis la **remplace** par une autre prestation du catalogue ou la **retire** sans remplacement. Le client a déjà accepté la proposition : remplacer ou retirer exige qu'il accepte aussi ce changement (case cochée par le conseiller). Rien d'autre ne change après le dépôt.

Cas d'usage : `src/application/tarifs.ts` (`marquerIndisponible`, `remplacerLigne`, `retirerLigne`). Base : `supabase/migrations/20261022170000_ligne_retiree.sql` et `20261022170100_indisponible_apres_depot.sql`. Écrans : page de la proposition (actions de ligne), écran d'accord. Test : `supabase/scripts/test_indisponible_apres_depot.sql`.

```gherkin
Scénario : l'atelier est complet après le dépôt, il est remplacé
  Étant donné une proposition au dépôt reçu : train, hôtel et atelier confirmés, rien de réservé
  Quand la revérification de l'atelier conclut « indisponible » et que la conseillère le marque indisponible
  Alors l'atelier sort du total et la proposition reste au dépôt reçu
  Quand elle le remplace par le même atelier le dimanche, la case « Le client a accepté ce changement » cochée
  Alors l'ancienne ligne est « remplacée », la nouvelle naît « à vérifier » au prix du catalogue
  Et le remplacement est journalisé avec l'ancien et le nouveau prix
  Quand le prix de la nouvelle ligne est vérifié puis accepté, et chaque ligne réservée
  Alors la proposition est réservée et le dossier conclu

Scénario : le client renonce à une prestation indisponible
  Quand la conseillère retire l'hôtel indisponible, la case cochée
  Alors la ligne est « retirée », hors total, et le retrait est journalisé
  Et la proposition est réservée dès que les lignes restantes le sont
```

## Ce qui est permis après le dépôt

| Action | Condition | Refus |
| --- | --- | --- |
| Marquer indisponible (`confirme` ou `a_verifier` → `indisponible`) | ligne non réservée, aucun accord ni option encore valable | OT012 si une démarche est en cours |
| Remplacer (`indisponible` → `remplacee` + nouvelle ligne `a_verifier`) | accord du client coché | OT013 sans l'accord |
| Retirer (`indisponible` → `retiree`) | accord du client coché, au moins une autre prestation restante | OT013 sans l'accord, OT014 pour la dernière |
| Confirmer le prix de la remplaçante (`a_verifier` → `confirme`) | prix vérifié ou saisi | — |
| Tout le reste : repasser à vérifier, ajouter, changer date ou participants, budget, séjour | — | OT008 |

## Ce qui en découle

- La proposition **reste au dépôt reçu** : elle ne repasse jamais « à vérifier » ni « prête ». Elle devient **réservée**, et le dossier **conclu** (`gagnee`), quand toutes ses lignes comptées sont réservées (`suivre_proposition`).
- Lignes **hors total et hors mails** : `remplacee`, `retiree`, `indisponible`. Une ligne retirée est un état final.
- Le **journal** garde un événement `changement` (`remplacement` ou `retrait`) au nom du conseiller, avec `accord_client: true`, l'ancien total de la ligne et, pour un remplacement, le nouveau total au prix du catalogue. Libellés : `src/domain/resumeEvenement.ts`.
- Le **montant du dépôt** n'est enregistré nulle part : un remplacement plus cher ou moins cher ne recalcule aucun dépôt. Le nouveau total est affiché, à reporter au client par le conseiller.
- Sur l'écran d'accord, une ligne indisponible renvoie à la proposition (`ligne_indisponible`) au lieu d'un refus générique.
