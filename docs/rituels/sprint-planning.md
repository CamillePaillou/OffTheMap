# Sprint Planning (E10.3)

**Sprint unique, J1 (19/10/2026) à J7, débordement possible jusqu'au J9.** Préparé par la PO, complété le J2 (20/10/2026) avec ce qui a été livré. Temps pris sur les 20 % non productifs (charge 0).

## 1. Sprint Goal accepté

> Un conseiller obtient une proposition chiffrée dont les prix sont vérifiés par l'agent, puis réserve une prestation : option de 72 h seulement après son accord, confirmation seulement après une seconde validation.

Détail et critère d'atteinte : [`sprint-goal.md`](sprint-goal.md). Definition of Done : [`definition-of-done.md`](definition-of-done.md).

## 2. Équipe et capacité

| Membre | Rôle | Scrum Master |
| --- | --- | --- |
| Callista Loré | PO et développeuse | J1 |
| Camille Paillou | Développeuse | J2 |
| Tabitha | Développeuse | J3 |
| Océane Gohier-Tallon | Développeuse | J4 |
| Ainouche Mustapha Islam | Développeur | J5 |

- **5 personnes × 7 jours × 80 % de temps productif = 28 jours** (5,6 jours chacune). Callista porte les tickets de PO dans sa capacité.
- Charge des Must retenue : **25,85 jours**, soit 92 % de la capacité.
- Hypothèse : assistant IA pour toute l'équipe, durées de codage × 0,7 (plan, section 8).

## 3. Où en est le sprint au J2

**Tenu = livré avant la fin au plus tard prévue par le [PERT](../planning/pert.md).** Tous les tickets livrés l'ont été en avance : aucune estimation n'a été dépassée, donc aucune n'a été corrigée. Pour les lignes marquées ⚠ (l'issue et le plan v6 ne disent pas la même chose), la valeur retenue est celle de l'issue, qui a été tenue.

- **Livré : 36 tickets Must sur 48**, plus quatre Should pris en avance (E1.2, E3.3, E5.2, E5.4).
- **Chemin critique** : E0.1, E0.4, E0.16, E0.5 et E8.3 sont livrés. Reste E11.2 (campagne de 12 cas), puis E7.4 et E7.6.
- **À faire : 5,4 jours** de travail sur cinq jours (J3 à J7), à cinq.
- À la rétrospective : le rythme réel est bien plus rapide que les estimations (l'assistant IA fait plus que × 0,7). Recalibrer pour le prochain sprint plutôt que corriger celui-ci.

Livré = date et heure du dernier commit du ticket dans `dev`. « Par » = l'auteur des commits.

## 4. Tickets des développeurs

| Ticket | Issue | Titre | Issue (j) | Plan v6 (j) | Retenue (j) | Par | Livré | Tenu |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E0.1 | #79 | Dépôt, branches et protections | 0,3 | 0,4 ⚠ | **0,3** | Camille | J1 11:30 | oui |
| E0.2 | #80 | CI et déploiement continu (lint, types, tests, build, secrets, Vercel) | 0,4 | 0,1 ⚠ | **0,4** | Camille | J1 14:07 | oui |
| E0.3 | #81 | Docker Compose, Makefile, .env.example et squelette Next.js | 0,7 | 0,7 | **0,7** | Camille | J1 14:38 | oui |
| E0.4 | #82 | Types et énumérations figés dans /types | 0,5 | 0,5 | **0,5** | Callista | J1 13:16 | oui |
| E0.16 | #83 | Migrations des tables du noyau | 0,7 | 0,5 ⚠ | **0,7** | Camille | J1 16:06 | oui |
| E0.5 | #84 | Tables de l'agent (verifications, options) | 0,7 | 0,5 ⚠ | **0,7** | Camille | J1 16:14 | oui |
| E0.7 | #86 | Fonction de transition de statut | 0,4 | 0,4 | **0,4** | Camille | J2 09:33 | oui |
| E0.10 | #89 | Seeds : catalogue et dossiers de démonstration | 0,5 | 0,5 | **0,5** | Callista | J2 07:38 | oui |
| E0.11 | #90 | Connexion du conseiller | 0,2 | 0,4 ⚠ | **0,2** | Océane | J1 21:20 | oui |
| E0.12 | #91 | Fixtures JSON du dashboard | 0,25 | 0,25 | **0,25** | Océane | J1 21:32 | oui |
| E0.13 | #92 | Port LlmClient, faux client, minimisation | 0,4 | 0,4 | **0,4** | Mustapha | J2 02:09 | oui |
| E0.17 | #142 | Simulateur du formateur | 0,5 | 0,5 | **0,5** | Mustapha | J2 10:11 | oui |
| E0.19 | #143 | Adaptateur OpenRouter | 0,3 | 0,3 | **0,3** | Camille | J2 11:43 | oui |
| E1.1 | #95 | Déposer une demande | 0,9 | 0,8 ⚠ | **0,9** | Callista | J2 08:17 | oui |
| E2.1 | #97 | Consulter et corriger la fiche | 1,3 | 1 ⚠ | **1,3** | Océane | J2 12:23 | oui |
| E2.2 | #98 | Fiche automatique dès qu'une demande arrive | 1,2 | 0,5 ⚠ | **1,2** | Callista | J2 11:44 | oui |
| E3.1 | #99 | Trier une demande | 0,4 | 0,3 ⚠ | **0,4** | Callista | J2 12:07 | oui |
| E4.2 | #103 | Prix exact contrôlé par le code | 1,4 | 0,5 ⚠ | **1,4** | Camille | J2 14:02 | oui |
| E4.4 | #105 | Brouillon de proposition | 0,9 | 1,1 ⚠ | **0,9** | Océane | J2 14:34 | oui |
| E4.5 | #106 | Proposition, total et alertes | 1,1 | 0,8 ⚠ | **1,1** | Océane | J2 14:44 | oui |
| E5.1 | #107 | Confirmer les tarifs, n'envoyer que des prix vérifiés | 0,8 | 0,8 | **0,8** | Callista | J2 12:25 | oui |
| E6.1 | #110 | Répondre à un changement sans perdre la version envoyée | 0,2 | 0,2 | **0,2** | Océane | J2 15:15 | oui |
| E7.1 | #115 | Enregistrer l'acceptation et le dépôt reçu | 0,4 | 0,3 ⚠ | **0,4** | Callista | J2 12:57 | oui |
| E8.3 | #123 | Vérifier le prix par un agent | 1,5 | 1,1 ⚠ | **1,5** | Camille | J2 12:19 | oui |
| E8.4 | #124 | Écart de prix et réponse du serveur | 0,7 | 0,5 ⚠ | **0,7** | Océane | J2 13:22 | oui |
| E8.5 | #125 | Trace et faits comparés au JSON | 0,7 | 0,5 ⚠ | **0,7** | Camille | J2 10:14 | oui |
| E9.3 | #129 | Écran d'accord | 0,6 | 0,7 ⚠ | **0,6** | Mustapha | J2 12:04 | oui |
| E9.4 | #130 | Poser une option après accord | 0,5 | 0,5 | **0,5** | Mustapha | J2 12:50 | oui |
| E7.3 | #117 | Rejouer le cas de bout en bout | 0,4 | 0,4 | **0,4** | Tabitha | à faire | à suivre |
| E7.5 | #119 | Passe sécurité : aucune clé | 0,2 | 0,2 | **0,2** | Tabitha | à faire | à suivre |
| E9.6 | #132 | L'agent ne peut rien écrire | 0,4 | 0,4 | **0,4** | Tabitha | à faire | à suivre |
| E11.2 | #147 | Campagne v1, diagnostic, retest v2 | 1 | 1 | **1** | Mustapha | à faire | à suivre |

## 5. Tickets de la PO

| Ticket | Issue | Titre | Issue (j) | Plan v6 (j) | Retenue (j) | Par | Livré | Tenu |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E0.8 | #87 | Matrice des transitions | 0,25 | 0,25 | **0,25** | Callista | J1 14:10 | oui |
| E4.1 | #102 | Règles de chiffrage | 0,25 | 0,2 ⚠ | **0,25** | Callista | J1 16:30 | oui |
| E8.2 | #122 | Contrat de l'agent | 0,4 | 0,4 | **0,4** | Callista | J1 14:01 | oui |
| E9.1 | #127 | Schéma des permissions | 0,3 | 0,3 | **0,3** | Callista | J1 14:40 | oui |
| E10.1 | #134 | Sprint Goal et DoD | 0,2 | 0,2 | **0,2** | Callista | J1 14:17 | oui |
| E10.2 | #135 | Modèles de rituels | 0,1 | 0,1 | **0,1** | Camille | J1 15:38 | oui |
| E11.1 | #146 | Jeu de 12 cas | 0,5 | 0,5 | **0,5** | Callista | J2 07:25 | oui |
| E9.7 | #133 | Note : échec, décision humaine, conception révisée | 0,3 | 0,3 | **0,3** | Callista | à faire | à suivre |
| E12.1 | #149 | Dossier de conception révisé | 0,5 | 0,5 | **0,5** | Callista | à faire | à suivre |
| E12.2 | #150 | Fiche de changement et décision | 0,3 | 0,3 | **0,3** | Callista | à faire | à suivre |
| E12.3 | #151 | Dossier de livraison et verdict de recette | 0,4 | 0,4 | **0,4** | Callista | à faire | à suivre |

## 6. Tickets de toute l'équipe

| Ticket | Issue | Titre | Issue (j) | Plan v6 (j) | Retenue (j) | Par | Livré | Tenu |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| E7.4 | #118 | Correctifs d'intégration | 1,3 | 0,8 ⚠ | **1,3** | Tous | à faire | à suivre |
| E7.6 | #120 | Sprint Review | 0,6 | 0,4 ⚠ | **0,6** | Tous | à faire | à suivre |
| E10.3 | #136 | Sprint Planning | 0 | 0 | **0** | Tous | J2 (ce document) | oui |
| E10.4 | #137 | Daily écrit chaque jour | 0 | 0 | **0** | Scrum Master du jour | chaque jour | à suivre |
| E10.5 | #138 | Rétrospective de fin de sprint | 0 | 0 | **0** | Tous | à faire | à suivre |

Hors sprint, livrés en avance (Should) : E1.2 Corriger ma demande depuis un lien (Callista), E3.3 Comprendre ce que je dois corriger (Callista), E5.4 Mails modèles (Callista), E5.2 Remplacer une ligne indisponible (Camille).

## 7. Charge retenue par personne

| Membre | Charge retenue | Déjà livrée | Reste | Part de « Tous » (E7.4, E7.6) |
| --- | ---: | ---: | ---: | ---: |
| Callista Loré | 8,1 j (dont 3,4 j de PO) | 6,6 j | 1,5 j | 0,38 j |
| Camille Paillou | 7,2 j | 7,2 j | 0 j | 0,38 j |
| Tabitha | 1 j | 0 j | 1 j | 0,38 j |
| Océane Gohier-Tallon | 4,65 j | 4,65 j | 0 j | 0,38 j |
| Ainouche Mustapha Islam | 3 j | 2 j | 1 j | 0,38 j |
| **Total** | **25,85 j** | **20,45 j** | **3,5 j** | **1,9 j** |

Les charges dépassent 5,6 j pour Callista et Camille parce qu'elles ont pris les tickets qui débloquaient les autres ; c'est déjà livré. Le reste est réparti pour finir sans surcharge.

## 8. Engagement

| Membre | Rôle | Engagé sur le Sprint Goal | Estimations relues |
| --- | --- | --- | --- |
| Callista Loré | PO et développeuse, Scrum Master du J1 | oui | oui |
| Camille Paillou | Développeuse, Scrum Master du J2 | oui | oui |
| Tabitha | Développeuse, Scrum Master du J3 | oui | oui |
| Océane Gohier-Tallon | Développeuse, Scrum Master du J4 | oui | oui |
| Ainouche Mustapha Islam | Développeur, Scrum Master du J5 | oui | oui |

Reporté dans [`sprint-goal.md`](sprint-goal.md) (« Confirmé au planning ») et [`definition-of-done.md`](definition-of-done.md) (« Relue au planning »). La rotation des Scrum Masters est dans [`scrum-masters.md`](scrum-masters.md).

## 9. Suivi

Le PERT du sprint (dates au plus tôt et au plus tard, marges, chemin critique) est dans [`../planning/pert.md`](../planning/pert.md), tiré des mêmes issues.
