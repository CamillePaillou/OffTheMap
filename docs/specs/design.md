# Design DÉTOUR : charte 2026

**Source** : brief client « Nous avons changé de visage » (octobre 2026) et brand kit du formateur, dépôt [PANDORMedia/detour](https://github.com/PANDORMedia/detour), branche `rebrand-2026`, dossier `brand-2026/` (`charte/index.html` à lire en premier).
**Règle du brief** : tout ce qui est montré au client (écrans, propositions envoyées aux voyageurs, supports de pitch) porte la nouvelle charte. L'ancien logo et l'ancien bleu nuit/cyan sont retirés. **Une seule identité**, pour le site public comme pour l'espace conseiller, et pas de mode sombre.

## Plateforme de marque, rendue visible dans le produit

| Valeur | Où on la voit |
| --- | --- |
| **Curiosité** : l'adresse d'à côté | Accueil (« Ce que nous tenons »), chatbot qui répond à partir du catalogue des prestataires |
| **Exactitude** : un prix affiché est vérifié et daté | Chaque prix confirmé porte « vérifié le 21/10 à 16:42 » : écran proposition, accord, carnet de route, mails |
| **Attention** : une personne compose, signe et confirme | Carnet de route et mails signés du **prénom** du conseiller ; le O ne saute que quand **le conseiller** confirme une réservation |

Signature : **Prenez le pas de côté.** (pied de page, carnet de route, mails).

## Couleurs (`app/globals.css`, préfixe `--detour-`)

Les six couleurs du brief, à leur valeur exacte (vérifiées par `lib/design.test.ts`) :

| Jeton | Valeur | Classe | Usage |
| --- | --- | --- | --- |
| Encre | `#16233F` | `encre` | texte, logo, aplats (en-tête du back-office, pied de page), bouton principal |
| Craie | `#F6F1E7` | `craie` | fond principal |
| Jaune | `#F2B705` | `jaune` | **le O seulement** (logo et saut typographique). Jamais de texte jaune sur fond clair, jamais d'aplat ni de bordure jaune |
| Ciel | `#BCD3EA` | `ciel` | fonds secondaires : bloc « Maintenant » quand c'est au conseiller d'agir, pastilles, valeur « Exactitude » |
| Brique | `#C4553A` | `brique` | alertes bloquantes, prix modifié, budget dépassé |
| Ballast | `#6B7385` | `ballast` | bordures des champs de saisie (contraste 3:1 des éléments d'interface) |

Nuances tirées de la charte ou calculées pour le contraste :

| Jeton | Valeur | D'où | Usage |
| --- | --- | --- | --- |
| `encre-doux` | `#5B6480` | « muted » du brand kit | texte secondaire |
| `encre-clair` | `#24365C` | encre éclaircie | survol du bouton principal |
| `carte` | `#FBF8F1` | « card » du brand kit | surfaces posées sur la craie |
| `trait` | `#D2D0CC` | « line » du brand kit (encre à 16 %) | filets, séparateurs |
| `ciel-pale` | `#E2E7E8` | ciel à 35 % sur craie | sélection, informations non bloquantes |
| `brique-texte` | `#9E3F28` | brique assombrie | texte d'erreur ou d'écart de prix |
| `brique-pale` | `#EFDBCF` | brique à 14 % sur craie | fond d'une alerte bloquante |
| `craie-sur-encre` | `#D7DCE8` | navigation du brand kit sur l'encre | texte courant sur aplat encre |
| `craie-sourde` | `#AEB6CA` | « muted » des bandes encre du brand kit | texte secondaire sur aplat encre |

Proportions visées : craie 60 %, encre 28 %, ciel 6 %, jaune 4 %.

## Typographie

Deux familles (licence OFL, `next/font/google`), pas de troisième :

- **Bricolage Grotesque** 600 et 800 : titres, prix, accroches. Minuscules, approche serrée (−2,5 %). Les capitales sont réservées au logo.
- **Instrument Sans** 400, 500 et 600 : textes, interfaces, propositions aux voyageurs. 17 px sur le site, 15 px dans l'espace conseiller (outil dense).

## Logo

- Composants `Logo` et `Monogramme` (`app/_composants/logo.tsx`), tracés **recopiés des SVG du kit** (`logo-traces.ts`). Le logo n'est jamais tapé au clavier. Fichiers du kit dans `public/marque/` ; favicon `app/icon.svg` (icône d'app du kit) et `app/apple-icon.png`.
- Principal (encre et jaune) sur la craie ; négatif (craie et jaune) sur l'encre : en-tête du back-office, pied de page.
- **Taille minimale** : 96 px de large à l'écran. Tous les logos sont posés à 34 px de haut ou plus (99 px de large). Plus petit, on utilise le monogramme « DO ».
- Ni ombre, ni contour, ni dégradé. Le O reste jaune.

## Le saut du O (mouvement)

Animation du kit : élan, saut, clic, repos, en 1,15 s, courbe `cubic-bezier(.3, .7, .4, 1)`, pivot au pied du O (`.o-saute`).

- **À l'ouverture du site** : le O du logo de l'en-tête saute **une fois par visite** (`sessionStorage`).
- **Quand un conseiller confirme une réservation** (écran d'accord, seconde validation) : le monogramme « DO » se clique à côté de « Réservation confirmée par Alice ». Un seul monogramme par écran : celui de la dernière réservation confirmée. Le saut n'est déclenché que par l'envoi du formulaire du conseiller, jamais par l'agent. À la relecture de la page, le monogramme reste posé.
- Jamais en boucle ; coupé si l'ordinateur demande moins d'animations (`prefers-reduced-motion`).

## Le saut typographique

Dans un titre de 28 px ou plus, **un seul** o (celui du mot qui porte l'idée) monte d'une demi-hauteur et passe en jaune. Composant `<Saut avant="dét" apres="ur" />`. Jamais dans un texte courant, un prix ou une adresse. Un par page, vérifié par `lib/design.test.ts`.

| Écran | Titre |
| --- | --- |
| Accueil | Le meilleur du voyage, c'est le dét**o**ur. |
| Formulaire | C**o**mposez votre week-end |
| Merci | Merci, c'est n**o**té. |
| Correction envoyée | Merci, c'est c**o**rrigé. |

## Ton de voix

Précis d'abord, malicieux ensuite, et seulement dans la chute. « Nous » pour l'agence, « je » pour le conseiller, qui signe de son prénom. Une pointe d'humour par message au plus, jamais sur un prix ni sur un problème. Pas d'astérisque sur un prix, pas de « Partez autrement ! », pas de message d'erreur brut.

- Site : « Composer mon week-end » (action principale, partout), accroches réécrites.
- Mails modèles (`src/domain/mails.ts`) : chaque prix suivi de « (prix vérifié le 21/10 à 16 h 42) ». Un prix non daté bloque l'envoi. Signature : prénom, puis « DÉTOUR · Prenez le pas de côté. »
- Messages de l'agent : consignes du brouillon (programme) et du chatbot au ton DÉTOUR.

## Écrans

| Écran | Ce qui porte la charte |
| --- | --- |
| Accueil | Accroche avec saut, photo du kit (voyageuse dans le train), trois destinations en photo du kit, « Comment on travaille » en ligne de train, les trois valeurs, relance sur aplat encre |
| Formulaire, merci, correction | Stations de la ligne en encre ; points à revoir en ciel (ce n'est pas une erreur) ; erreurs en brique |
| Espace conseiller | Bandeau encre et logo en négatif ; pastilles « À vous » (encre), « Client » (ciel), « Auto » (neutre) ; jauges en encre, en brique si le budget est dépassé |
| Proposition, trace de l'agent | Dates « sam. 7 nov. », prix confirmés datés et signés, écarts de prix en brique |
| Accord et confirmation | Prix revérifié daté ; confirmation de la réservation avec le saut du O |
| Carnet de route (`/imprimer`) | Le billet du kit : logo, « Paris → Nantes », dates, voyageurs, total, « Prix vérifiés le … · Composé par Alice », talon encre au monogramme ; programme, prix datés ligne par ligne, mot signé du conseiller |

Chaque prix revérifié montré au conseiller est daté (colonne « Prix revérifié », trace de l'agent, accord) ; sous le total, la date du plus ancien prix vérifié ou le nombre de prix encore au tarif du catalogue.

Composants CSS : `.btn-principal` (pilule encre), `.btn-second` (contour encre), `.panneau`, `.ligne-formulaire`, `.saut`, `.o-saute` ; espace conseiller : `.bo`, `.bo-btn`, `.bo-btn-2`, `.bo-champ`, `.bo-puce`, `.bo-carte`, `.bo-bloc`.

## Photos

Les cinq images de direction du kit (`brand-2026/photo/`), exportées en JPEG dans `public/detour/` : `train.jpg` (accueil), `nantes.jpg`, `lyon.jpg`, `lille.jpg` (destinations, vignettes des dossiers), `hotel.jpg`. Les anciennes photos (couchers de soleil saturés, banque d'images) sont retirées.

## Écarts à la charte, et pourquoi

Le brief préfère une question à une surprise. Voici où nous nous en écartons :

1. **Texte secondaire en `#5B6480` et non en ballast.** Le ballast n'a que 4,2:1 sur la craie, sous le minimum de lisibilité (4,5:1). `#5B6480` est la couleur « muted » du brand kit lui-même ; le ballast sert aux bordures.
2. **Brique assombrie pour le texte** (`#9E3F28`) : la brique du brief fait 4,0:1 sur la craie.
3. **Nuances de surface** (`carte`, `trait`, `ciel-pale`, `brique-pale`) : tirées du brand kit (`--card`, `--line`) ou mélangées à la craie. Aucune nouvelle teinte.
4. **Focus clavier** : contour encre sur les fonds clairs, jaune seulement sur les aplats encre (classe `sur-encre`). Le brand kit met du jaune partout, mais le brief interdit le jaune sur fond clair (1,9:1).
5. **Pas de police IBM Plex Mono** : le brand kit l'utilise pour ses légendes, mais le brief dit « deux familles, pas de troisième ».
6. **Carnet de route** : logo et monogramme sur le même billet, comme le modèle du brand kit (« Carnet de route envoyé au voyageur »).
7. **Les supports de pitch** ne sont pas dans le dépôt : à refaire avec le kit (couleurs, typographies, logo).
