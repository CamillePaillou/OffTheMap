# Sprint Review (E7.6, #120)

- **Date :** jeudi 22/10/2026, vers 15 h
- **Scrum Master :** Océane Gohier-Tallon (Scrum Master du jour)
- **Présents :** Sîon, pour le client (l'agence DÉTOUR) ; Callista Loré (PO), Camille Paillou, Océane Gohier-Tallon, Ainouche Mustapha Islam. Absente : Tabitha.
- **Démonstration :** en mode réel (modèle d'OpenRouter et simulateur du formateur), sur le cas de Nantes : deux voyageurs, un week-end créatif sans voiture.

## Répétition

- **Par l'équipe :** plusieurs répétitions à plusieurs avant la démonstration, en testant les parcours.
- **Défaut trouvé :** une page introuvable (404) en passant à l'écran d'accord. Depuis une vraie proposition, il lisait encore la proposition de démonstration. Corrigé avant la revue : il relit maintenant la proposition en base (#224, `docs/recette/bout-en-bout.md`, « Correctifs d'intégration »).
- **Rejeu automatique :** en plus, le cas de Sophie est rejoué du formulaire à la réservation à chaque CI (`supabase/scripts/test_bout_en_bout.sql`).

## Parcours démontré

- [x] Demande du voyageur (formulaire public)
- [x] Brouillon chiffré par le code, vérification des prix par l'agent
- [x] Espace conseiller
- [x] Nouvelle charte DÉTOUR 2026 (CR-01), sur le site et l'espace conseiller
- [x] Chatbot du site
- [ ] Seconde validation (confirmation avec la clé d'approbation) : non montrée
- [ ] Cas d'échec (serveur en erreur, « non vérifié », aucun prix annoncé) : non montré

Les parties non montrées sont prouvées autrement :
- la seconde validation, par les tests du parcours de réservation (`src/application/parcoursReservation.test.ts`) et par la campagne E11.2 (cas N03, en base) ;
- le serveur en erreur, par la campagne (E03, délai dépassé) et par `SIMULATEUR_PANNE=erreur_serveur` (recette du rebranding, « Ton de voix »).

## Retours

- **Client :** démonstration validée, tout le parcours est retenu, aucune remarque.
- **Retours UX de Sîon, en tant que formateur :**

| Retour | Suite | Où |
| --- | --- | --- |
| Rendre les pastilles de statut plus parlantes dans l'espace conseiller | Couleurs par famille de statut (à moi d'agir, le dossier attend le client, validé, erreur, automatique), libellé toujours écrit à côté | #233 ; `docs/specs/design.md`, écart n° 7 |
| Pouvoir parler au chatbot pendant qu'on remplit sa demande de voyage | Chatbot ouvert sur la page de demande ; il aide à remplir le formulaire sans lire les valeurs saisies | #229 ; `docs/specs/chatbot.md` |

## Backlog mis à jour

| Changement | Décision | Où |
| --- | --- | --- |
| Pastilles de statut et chatbot dans la demande | Retours du formateur, faits le 22/10 | voir plus haut |
| Suivi de la demande par le voyageur : numéro de dossier, suivi sans compte comme un colis, compte facultatif, réponse en ligne à la proposition | Proposé par la PO, accepté par le client, estimé à 0,5 j ; fait sans rien sortir du sprint | #234, `docs/specs/espace-client.md` |
| Retours sur la demande et la proposition côté conseiller | Fait le 23/10 | #236 |
| Mode rejeu annoncé, pour une démonstration sans OpenRouter (E11.3) | Fait | #148 |
| Retest d'A02 et A03 avec le nouveau modèle (`recursive/flint-v1.0:free`) | Fait le 23/10 : A03 réussi, A02 en échec (fiche refusée par le schéma) | `evaluation/README.md` |
| Mesure du temps de préparation d'une proposition (objectif 2 h) | Reportée : non mesurée pendant le sprint | Dossier de livraison, réserves |

Aucune issue n'a été sortie du sprint après la revue.

## Verdict

Démonstration validée par le client. Le verdict de recette et ses réserves sont dans `docs/livrables/E12.3-dossier-livraison.md`.
