# Sprint Planning (E10.3)

**Sprint unique, J1 (19/10/2026) à J7, débordement possible jusqu'au J9.** Préparé par la PO ; l'équipe confirme ou corrige les estimations et s'engage sur le Sprint Goal. Temps pris sur les 20 % non productifs (charge 0).

## 1. Sprint Goal à accepter

> Un conseiller obtient une proposition chiffrée dont les prix sont vérifiés par l'agent, puis réserve une prestation : option de 72 h seulement après son accord, confirmation seulement après une seconde validation.

Détail et critère d'atteinte : [`sprint-goal.md`](sprint-goal.md). Definition of Done : [`definition-of-done.md`](definition-of-done.md).

## 2. Capacité

- 4 développeurs × 7 jours × 80 % de temps productif = **22,4 jours** (5,6 jours chacun). La PO porte ses propres tickets à côté.
- Hypothèse : assistant IA pour toute l'équipe, durées de codage × 0,7 (plan, section 8). À revoir à la rétrospective.

## 3. Charge des Must par responsable

| Responsable | Charge écrite dans les issues | Charge du plan v6 |
| --- | ---: | ---: |
| P1 | 5,7 j | 4,2 j |
| P2 | 4,65 j | 4,25 j |
| P3 | 4,3 j | 3,7 j |
| P4 | 5,8 j | 4,9 j |
| PO | 3,5 j | 3,45 j |
| Tous | 1,9 j | 1,2 j |

Développeurs (P1 à P4 et « Tous ») : **22,35 j selon les issues, 18,25 j selon le plan v6**, pour 22,4 j de capacité. Les issues portent encore une partie des charges de la première version du plan : les lignes marquées ⚠ ci-dessous diffèrent. Chaque développeur retient une valeur pour ses tickets ; la PO reporte ensuite la valeur retenue dans l'issue.

## 4. Estimations : à confirmer ou corriger par chaque développeur

Colonnes à remplir en séance : **Retenue** (la charge que le développeur s'engage à tenir) et **Par** (son prénom).

| Resp. | Ticket | Issue | Titre | Issue | Plan v6 | Retenue | Par |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| P1 | E0.1 | #79 | Dépôt, branches et protections | 0,3 j | 0,4 j ⚠ | | |
| P1 | E0.2 | #80 | CI et déploiement continu (lint, types, tests, build, secrets, Vercel) | 0,4 j | 0,1 j ⚠ | | |
| P1 | E0.3 | #81 | Docker Compose, Makefile, .env.example et squelette Next.js | 0,7 j | 0,7 j | | |
| P1 | E1.1 | #95 | Déposer une demande | 0,9 j | 0,8 j ⚠ | | |
| P1 | E4.2 | #103 | Prix exact contrôlé par le code | 1,4 j | 0,5 j ⚠ | | |
| P1 | E4.5 | #106 | Proposition, total et alertes | 1,1 j | 0,8 j ⚠ | | |
| P1 | E7.3 | #117 | Rejouer le cas de bout en bout | 0,4 j | 0,4 j | | |
| P1 | E0.17 | #142 | Simulateur du formateur | 0,5 j | 0,5 j | | |
| P2 | E0.11 | #90 | Connexion du conseiller | 0,2 j | 0,4 j ⚠ | | |
| P2 | E0.12 | #91 | Fixtures JSON du dashboard | 0,25 j | 0,25 j | | |
| P2 | E2.1 | #97 | Consulter et corriger la fiche | 1,3 j | 1 j ⚠ | | |
| P2 | E3.1 | #99 | Trier une demande | 0,4 j | 0,3 j ⚠ | | |
| P2 | E5.1 | #107 | Confirmer les tarifs, n'envoyer que des prix vérifiés | 0,8 j | 0,8 j | | |
| P2 | E7.1 | #115 | Enregistrer l'acceptation et le dépôt reçu | 0,4 j | 0,3 j ⚠ | | |
| P2 | E8.4 | #124 | Écart de prix et réponse du serveur | 0,7 j | 0,5 j ⚠ | | |
| P2 | E9.3 | #129 | Écran d'accord | 0,6 j | 0,7 j ⚠ | | |
| P3 | E0.4 | #82 | Types et énumérations figés dans /types | 0,5 j | 0,5 j | | |
| P3 | E0.16 | #83 | Migrations des tables du noyau | 0,7 j | 0,5 j ⚠ | | |
| P3 | E0.5 | #84 | Tables de l'agent (verifications, options) | 0,7 j | 0,5 j ⚠ | | |
| P3 | E0.7 | #86 | Fonction de transition de statut | 0,4 j | 0,4 j | | |
| P3 | E0.10 | #89 | Seeds : catalogue et dossiers de démonstration | 0,5 j | 0,5 j | | |
| P3 | E6.1 | #110 | Répondre à un changement sans perdre la version envoyée | 0,2 j | 0,2 j | | |
| P3 | E7.5 | #119 | Passe sécurité : aucune clé | 0,2 j | 0,2 j | | |
| P3 | E8.5 | #125 | Trace et faits comparés au JSON | 0,7 j | 0,5 j ⚠ | | |
| P3 | E9.6 | #132 | L'agent ne peut rien écrire | 0,4 j | 0,4 j | | |
| P4 | E0.13 | #92 | Port LlmClient, faux client, minimisation | 0,4 j | 0,4 j | | |
| P4 | E2.2 | #98 | Fiche automatique dès qu'une demande arrive | 1,2 j | 0,5 j ⚠ | | |
| P4 | E4.4 | #105 | Brouillon de proposition | 0,9 j | 1,1 j ⚠ | | |
| P4 | E8.3 | #123 | Vérifier le prix par un agent | 1,5 j | 1,1 j ⚠ | | |
| P4 | E9.4 | #130 | Poser une option après accord | 0,5 j | 0,5 j | | |
| P4 | E0.19 | #143 | Adaptateur OpenRouter | 0,3 j | 0,3 j | | |
| P4 | E11.2 | #147 | Campagne v1, diagnostic, retest v2 | 1 j | 1 j | | |
| PO | E0.8 | #87 | Matrice des transitions | 0,25 j | 0,25 j | | |
| PO | E4.1 | #102 | Règles de chiffrage | 0,25 j | 0,2 j ⚠ | | |
| PO | E8.2 | #122 | Contrat de l'agent | 0,4 j | 0,4 j | | |
| PO | E9.1 | #127 | Schéma des permissions | 0,3 j | 0,3 j | | |
| PO | E9.7 | #133 | Note : échec, décision humaine, conception révisée | 0,3 j | 0,3 j | | |
| PO | E10.1 | #134 | Sprint Goal et DoD | 0,2 j | 0,2 j | | |
| PO | E10.2 | #135 | Modèles de rituels | 0,1 j | 0,1 j | | |
| PO | E11.1 | #146 | Jeu de 12 cas | 0,5 j | 0,5 j | | |
| PO | E12.1 | #149 | Dossier de conception révisé | 0,5 j | 0,5 j | | |
| PO | E12.2 | #150 | Fiche de changement et décision | 0,3 j | 0,3 j | | |
| PO | E12.3 | #151 | Dossier de livraison et verdict de recette | 0,4 j | 0,4 j | | |
| Tous | E7.4 | #118 | Correctifs d'intégration | 1,3 j | 0,8 j ⚠ | | |
| Tous | E7.6 | #120 | Sprint Review | 0,6 j | 0,4 j ⚠ | | |
| Tous | E10.3 | #136 | Sprint Planning | 0 j | 0 j | | |
| Tous | E10.4 | #137 | Daily écrit chaque jour | 0 j | 0 j | | |
| Tous | E10.5 | #138 | Rétrospective de fin de sprint | 0 j | 0 j | | |

## 5. Engagement

| Membre | Rôle | Engagé sur le Sprint Goal | Estimations relues |
| --- | --- | --- | --- |
| Callista Loré | PO | | |
| Camille Paillou | Développeuse, Scrum Master du J1 | | |
| Océane Gohier-Tallon | Développeuse | | |
| Ainouche Mustapha Islam | Développeur | | |

Une fois le tableau rempli : reporter la date et les présents dans [`sprint-goal.md`](sprint-goal.md) (« Confirmé au planning ») et dans [`definition-of-done.md`](definition-of-done.md) (« Relue au planning »), puis fermer l'issue E10.3 (#136).

## 6. Suivi

Le PERT du sprint (dates au plus tôt et au plus tard, marges, chemin critique) est dans [`../planning/pert.md`](../planning/pert.md), tiré des mêmes issues.
