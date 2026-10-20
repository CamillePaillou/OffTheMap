# Design DÉTOUR

**Source** : dépôt du formateur [PANDORMedia/detour](https://github.com/PANDORMedia/detour) (site vitrine `site/` et back-office `conseillers/`).
**Décision PO** : on garde le **logo et les couleurs** (nuancés), on change la **typographie et l'agencement**, avec une vraie réflexion UX.

## Ce qui est gardé

| Élément | Site du formateur | Off the Map |
| --- | --- | --- |
| Logo, favicon | `site/img/logo.png`, `favicon.png` | `public/detour/logo.png`, `app/icon.png` |
| Photos | `slide-1.jpg`, `nantes.jpg`, `lyon.jpg`, `lille.jpg` | `public/detour/` |
| Bleu du logo | `#1a7fb5` | `--detour-bleu`, inchangé |
| Orange du logo | `#ff7a00` | `--detour-orange` `#ff8a1e`, un peu adouci ; `--detour-orange-fonce` `#ad4d00` pour le bouton principal |
| Titres bleus | `#1a6fa0` | assombris en bleu nuit `#0e4a6e` (titres, pied de page) |

## Ce qui change

**Typographie** (via `next/font`, auto-hébergée) :

- Titres : **Bricolage Grotesque**, une grotesque expressive aux formes un peu irrégulières, qui garde le côté « insolite » de Lobster sans son manque de lisibilité.
- Texte : **Atkinson Hyperlegible**, dessinée pour la lisibilité (lettres bien distinctes : 0/O, 1/l/I). Chiffres tabulaires partout : dates et montants s'alignent.

**Fil conducteur : « la ligne »**. Un plan de ligne de train (stations reliées par un trait) montre toujours où l'on en est. Composant `app/_composants/ligne.tsx` :

- stations passées en bleu, station actuelle cerclée d'orange, stations à venir en gris ; l'état est aussi écrit pour les lecteurs d'écran ;
- horizontale sur grand écran, verticale sur téléphone (ou toujours verticale dans une colonne étroite).

Elle sert à l'accueil (« De votre demande au départ »), dans le formulaire (chaque bloc est une station qui se colore une fois rempli), sur les pages de remerciement (où en est la demande), et sur la fiche d'un dossier (Demande reçue → Tri → Entretien → Proposition → Gagné).

## Écrans

| Écran | Agencement | Pourquoi |
| --- | --- | --- |
| Accueil | Accroche à gauche (titre, une action, réassurance), photo à droite ; destinations en cartes postales avec le trajet ; « De votre demande au départ » en ligne ; quatre engagements ; relance finale | Une seule action principale, répétée en haut et en bas ; le parcours réel est expliqué avant qu'on le demande. **Aucun prix** : seuls des prix vérifiés sont annoncés |
| Demande | Formulaire en stations à gauche ; à droite, un **billet** qui récapitule la demande en direct et compte les étapes obligatoires, puis « Après l'envoi » | Le client voit ce que le conseiller lira, et sait ce qui manque. Une carte d'accueil préremplit la destination (`/demande?destination=Lyon`) |
| Correction | Motif du conseiller et « Comment faire » côte à côte, puis le même formulaire, points surlignés en ambre avec le commentaire sous le champ | Le client comprend pourquoi avant de corriger |
| Merci | Confirmation et ligne « Où en est votre demande » | Le client sait ce qui va se passer et quand |
| Connexion | Formulaire et rappel de ce que l'espace permet | Page d'entrée claire pour l'équipe |
| Dossiers | Compteurs par groupe (à trier, en attente du client, en cours, clos), tableau dense avec pastilles de statut | Le conseiller voit d'abord ce qui l'attend |
| Fiche d'un dossier | En-tête (nom, statut, ligne) ; à gauche la demande, la fiche et l'historique ; à droite **« À faire »** (tri, relance, brouillon), propositions et mails | Lecture à gauche, décisions à droite, toujours au même endroit |
| Proposition | Total et jauge du budget, tarifs confirmés, alertes bloquantes ; panneau d'envoi ou de réponse à côté ; prestations ; programme et mail | L'envoi n'est possible que si tout est vérifié : on voit pourquoi en un coup d'œil |

## Règles

- **Une action principale par écran** (`.btn-principal`, orange foncé). Les actions secondaires sont en bleu nuit, en contour ou en lien.
- Les couleurs de statut ne portent jamais seules l'information : le libellé est toujours écrit.
- Ambre = « à revoir » (correction), rouge = erreur ou blocage, vert = confirmé.
- Contrastes vérifiés par un test (`lib/design.test.ts`) ; contour de focus orange ; lien « Aller au contenu » ; mise en page jusqu'à 360 px de large.

## Jetons (`app/globals.css`)

| Jeton | Valeur | Classe Tailwind | Usage |
| --- | --- | --- | --- |
| `--detour-nuit` | `#0e4a6e` | `nuit` | titres, boutons secondaires, pied de page |
| `--detour-bleu` | `#1a7fb5` | `bleu` | bleu du logo : ligne parcourue, repères (jamais du texte) |
| `--detour-lien` | `#136a99` | `lien` | liens |
| `--detour-orange` | `#ff8a1e` | `orange` | orange du logo : filets, station actuelle, focus (jamais sous du texte) |
| `--detour-orange-fonce` | `#ad4d00` | `orange-fonce` | bouton principal |
| `--detour-fond` | `#f4f7fa` | `fond` | fond des pages |
| `--detour-ciel` | `#e8f2f9` | `ciel` | aplats légers, survol |
| `--detour-filet` | `#d9e4ec` | `filet` | bordures, ligne à venir |
| `--detour-texte` | `#22313c` | `texte` | texte courant |
| `--detour-doux` | `#556673` | `doux` | texte secondaire |

Composants CSS : `.btn-principal`, `.panneau` (surface blanche bordée), `.ligne-formulaire` (fieldsets en stations, `data-rempli="true"` quand le bloc est rempli).
