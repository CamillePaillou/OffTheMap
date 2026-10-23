# Règles de chiffrage (E4.1)

**Contrat associé** : `types/chiffrage.ts`. Exemples chiffrés, à reprendre tels quels dans les tests d'E4.2 : `docs/specs/chiffrage-exemples.json`. **Fonction de chiffrage (E4.2)** : `chiffrer` dans `src/domain/chiffrage/chiffrer.ts`, avec `valeursDeReference` (section 3), `ecartVerification` et `formaterMontant` ; ses tests rejouent les neuf exemples. Les choix faits sans le client sont listés en section 5 et inscrits au registre des décisions.

## 1. Principes

- **Le prix est calculé par le code, jamais par l'IA.** Le brouillon fournit des prestations, des dates et des participants ; la fonction de chiffrage (E4.2) fait le reste. C'est une fonction pure, sans appel réseau ni base.
- **Tout est en centimes entiers.** Le simulateur donne des euros entiers ; l'adaptateur multiplie par 100. Aucune division n'intervient : il n'y a donc jamais d'arrondi.
- **Une valeur absente n'est jamais remplacée par 0.** Une ligne sans prix ne peut pas être chiffrée : c'est une erreur, pas un total partiel.

## 2. Formules

| Élément | Règle |
| --- | --- |
| Ligne | Une prestation, une date, un nombre de participants (format du simulateur). |
| Transport | Le simulateur vend un **aller-retour** par personne : une seule ligne, à la date du départ. Pas de ligne pour le retour. |
| Prix unitaire utilisé | `prix_confirme_cents` s'il existe, sinon `prix_unitaire_catalogue_cents` (copie figée à la création). |
| Total de ligne | prix unitaire utilisé × participants × nuits. Identique à la colonne calculée `total_ligne_cents` en base. |
| Hébergement | Prix par personne **et par nuit**. Une ligne porte ses nuits (`nb_nuits`, 1 à 14) à partir de sa date (première nuit) : cinq nuits dans le même hôtel = une ligne de 5 nuits. Les autres types ont toujours 1 nuit. Le brouillon calcule les nuits : chaque hôtel court jusqu'au prochain hôtel, ou jusqu'à la veille du départ. À la réservation, le simulateur ne posant qu'une date à la fois, une ligne de N nuits donne N options puis N réservations (une seule démarche, un seul accord). |
| Total de la proposition | Somme des totaux de ligne, lignes `remplacee`, `retiree` (E7.4) et `indisponible` exclues : une prestation qu'on ne peut pas vendre n'entre pas dans le prix. Leur total de ligne reste calculé, comme en base. Une ligne indisponible bloque de toute façon l'envoi. |
| Budget | **Global, pour tout le groupe**, jamais par personne. Le formulaire demande « Budget total pour tout le groupe ». Le total de la proposition est comparé tel quel à ce budget. |
| Marge | **Aucune** (décidé). |
| Frais, taxes, remises | Aucun. Les prix fictifs du simulateur sont pris tels quels ; les taxes ne sont pas modélisées (limite, section 5). |
| Enfants | Même prix que les adultes : le simulateur n'a pas de tarif enfant (limite, section 5). |
| Saison, ancienneté d'un tarif | Sans objet : toute ligne naît « à vérifier » et l'agent lit le prix du jour. |
| Écart après vérification | Prix revérifié − prix catalogue, par personne et pour la ligne. Positif = plus cher. Calculé par le code. |
| Affichage | `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`, par exemple « 358,00 € ». Attention : le séparateur avant « € » est une espace insécable (U+00A0) ; un test qui compare un texte doit l'utiliser. |

## 3. Contrôles

Le code écrit les alertes dans `propositions.alertes`. Une alerte **bloquante** empêche l'envoi ; une alerte non bloquante informe le conseiller, qui décide.

| Code | Condition | Bloquante |
| --- | --- | --- |
| `capacite_depassee` | participants > capacité **du catalogue** (valeur fixe). Les places réellement restantes, qui baissent avec les options et les réservations, sont vérifiées par l'agent, pas par le chiffrage | oui |
| `participants_superieurs_voyageurs` | participants > nombre de voyageurs du dossier | oui |
| `date_hors_sejour` | date hors du séjour fixé. Activité et transport : du premier au dernier jour inclus. Hébergement : toutes ses nuits, du premier jour à la veille du départ | oui |
| `prestation_inactive` | prestation retirée du catalogue (`actif` faux) | oui |
| `nuits_incoherentes` | nombre de nuits d'hébergement distinctes (toutes les nuits de chaque ligne) ≠ nuits de référence | non |
| `budget_depasse` | total > budget de référence | non |
| `budget_proche` | total ≥ 90 % du budget de référence et non dépassé (seuil choisi par l'équipe) | non |

- **Budget de référence** : `budget_reel_cents` de la fiche ; s'il est vide, `budget_annonce_cents` de la demande ; s'il n'y en a aucun, pas d'alerte de budget.
- **Séjour de référence** : dates fixes de la fiche ; sinon dates de la demande.
- **Nuits de référence** : `nb_nuits_fixe` de la fiche (calculé depuis les dates fixes) ; sinon `nb_nuits` de la demande (calculé depuis ses dates).
- Les contrôles portent sur toutes les lignes sauf `remplacee`, y compris les lignes indisponibles.
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
| H | Comme A, atelier indisponible | 288,00 € | aucune (l'atelier sort du total ; l'envoi reste bloqué par son statut) |
| I | Comme C, mais une seule ligne d'hôtel le 7, de 2 nuits | 550,00 € | `budget_depasse` |

Le fichier JSON donne l'entrée complète et le résultat attendu de chaque cas. Un test vérifie que ses totaux et ses alertes sont cohérents ; E4.2 doit le faire passer à sa fonction.

## 5. Limites et décisions

À reporter dans la liste des limites du dossier de livraison (J7) et au registre des décisions.

| Point | Choix | Pourquoi | Qui décide |
| --- | --- | --- | --- |
| Taxes | Non modélisées : prix fictifs pris tels quels | Le cours précise que le catalogue fictif ne couvre pas les taxes réelles | limite annoncée |
| Prix enfant | Même prix que les adultes | Le simulateur n'a pas de tarif enfant | équipe ; question possible au client lors de la réunion du J6 |
| Seuil « budget proche » | 90 % du budget | Prévenir le conseiller avant le dépassement ; le contrôle du budget relève de l'application | équipe |
| Budget | Global, pour tout le groupe | Un budget global traité comme individuel fausse toute la proposition, surtout pour un groupe | équipe ; libellé du formulaire à aligner |
| Marge | Aucune | Décision d'équipe | équipe |
