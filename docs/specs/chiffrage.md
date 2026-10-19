# Règles de chiffrage (E4.1)

**Version 1 · 19 octobre 2026 · à relire par le développeur du chiffrage (P1).** Contrat associé : `types/chiffrage.ts`. Exemples chiffrés, à reprendre tels quels dans les tests d'E4.2 : `docs/specs/chiffrage-exemples.json`. Les valeurs marquées **à confirmer** attendent la réponse du client.

## 1. Principes

- **Le prix est calculé par le code, jamais par l'IA.** Le brouillon fournit des prestations, des dates et des participants ; la fonction de chiffrage (E4.2) fait le reste. C'est une fonction pure, sans appel réseau ni base.
- **Tout est en centimes entiers.** Le simulateur donne des euros entiers ; l'adaptateur multiplie par 100. Aucune division n'intervient : il n'y a donc jamais d'arrondi.
- **Une valeur absente n'est jamais remplacée par 0.** Une ligne sans prix ne peut pas être chiffrée : c'est une erreur, pas un total partiel.

## 2. Formules

| Élément | Règle |
| --- | --- |
| Ligne | Une prestation, une date, un nombre de participants (format du simulateur). |
| Prix unitaire utilisé | `prix_confirme_cents` s'il existe, sinon `prix_unitaire_catalogue_cents` (copie figée à la création). |
| Total de ligne | prix unitaire utilisé × participants. Identique à la colonne calculée `total_ligne_cents` en base. |
| Hébergement | Prix par personne **et par nuit** : une ligne par nuit. Deux nuits = deux lignes. |
| Total de la proposition | Somme des totaux de ligne, lignes `remplacee` exclues. |
| Marge | **Aucune** (décidé). |
| Frais, taxes, remises | Aucun. Les prix du simulateur sont pris tels quels, toutes taxes comprises (**à confirmer**). |
| Enfants | Même prix que les adultes : le simulateur n'a pas de tarif enfant (**à confirmer**). |
| Saison, ancienneté d'un tarif | Sans objet : toute ligne naît « à vérifier » et l'agent lit le prix du jour. |
| Écart après vérification | Prix revérifié − prix catalogue, par personne et pour la ligne. Positif = plus cher. Calculé par le code. |
| Affichage | `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`, par exemple « 358,00 € ». |

## 3. Contrôles

Le code écrit les alertes dans `propositions.alertes`. Une alerte **bloquante** empêche l'envoi ; une alerte non bloquante informe le conseiller, qui décide.

| Code | Condition | Bloquante |
| --- | --- | --- |
| `capacite_depassee` | participants > capacité de la prestation | oui |
| `participants_superieurs_voyageurs` | participants > nombre de voyageurs du dossier | oui |
| `date_hors_sejour` | date hors du séjour fixé. Activité et transport : du premier au dernier jour inclus. Hébergement : du premier jour à la veille du départ | oui |
| `prestation_inactive` | prestation retirée du catalogue (`actif` faux) | oui |
| `nuits_incoherentes` | nombre de dates d'hébergement distinctes ≠ `nb_nuits_fixe` | non |
| `budget_depasse` | total > budget de référence | non |
| `budget_proche` | total ≥ 90 % du budget de référence (**seuil à confirmer**) et non dépassé | non |

- **Budget de référence** : `budget_reel_cents` de la fiche ; s'il est vide, `budget_annonce_cents` de la demande ; s'il n'y en a aucun, pas d'alerte de budget.
- **Séjour de référence** : dates fixes de la fiche ; sinon dates de la demande.
- Une ligne « à vérifier » n'est pas une alerte : elle bloque déjà l'envoi par son statut.

## 4. Exemples

Catalogue du simulateur : train Nantes 48 €, hôtel Nantes 96 € par nuit, atelier Nantes 35 €, train Lyon 62 €, jeu de piste Lyon 29 € (par personne).

| Cas | Entrée | Total | Alertes |
| --- | --- | --- | --- |
| A | 2 adultes, Nantes du 7 au 8 nov., 1 nuit, budget 400 € : train, hôtel le 7, atelier | 358,00 € | aucune |
| B | Comme A, atelier revérifié et confirmé à 40 € | 368,00 € | `budget_proche` (92 %) |
| C | 2 adultes, du 7 au 9 nov., 2 nuits, budget 500 € : train, hôtel le 7 et le 8, atelier | 550,00 € | `budget_depasse` |
| D | 9 voyageurs, train pour 9 (capacité 8) | 432,00 € | `capacite_depassee` |
| E | Comme A, mais hôtel le 8 (nuit du départ) | 358,00 € | `date_hors_sejour` |
| F | 2 adultes, du 7 au 9 nov., 2 nuits fixées, budget 400 € : train, une seule ligne d'hôtel (le 7), atelier | 358,00 € | `nuits_incoherentes` |
| G | 4 adultes, Lyon, sans budget : train et jeu de piste | 364,00 € | aucune |

Le fichier JSON donne l'entrée complète et le résultat attendu de chaque cas. Un test vérifie que ses totaux et ses alertes sont cohérents ; E4.2 doit le faire passer à sa fonction.

## 5. À confirmer avec le client

1. Les prix du simulateur sont-ils toutes taxes comprises ?
2. Les enfants paient-ils le même prix que les adultes ?
3. Seuil de l'alerte « budget proche » : 90 % ?
