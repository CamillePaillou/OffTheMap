# Trier une demande : validée, à corriger ou refusée (E3.1)

Cas d'usage : `src/application/trierDossier.ts`. Base : `supabase/migrations/20261020170000_tri_dossier.sql`. Écran : panneau « Trier la demande » de la fiche (`app/conseiller/dossiers/[id]`).

## Décisions possibles

| Statut du dossier | Validée | À corriger | Refusée |
| --- | --- | --- | --- |
| `fiche_prete` | oui | oui, avec un lien de correction pour le client (E1.2) | oui, avec confirmation |
| `a_corriger` | oui (réponse du client reportée dans la fiche) | nouveau lien seulement (pas une nouvelle décision) | oui, avec confirmation |
| autre | — | — | — |

La matrice vient de `types/transitions.ts` ; un tri hors matrice est refusé sans rien écrire.

## Règles

| Règle | Choix | Où c'est garanti |
| --- | --- | --- |
| Enregistrement | Statut du dossier, ligne d'historique (auteur : le conseiller, détail avec la `decision`) et `fiches.decision` de la version courante, **ensemble ou rien** | `trier_dossier` → `changer_statut` (E0.7) |
| Visible dans l'historique | La transition apparaît dans l'historique de la fiche, avec le nom du conseiller | `historique_dossier` (auteur_id) ; écran E2.1 |
| Deux conseillers en même temps | Le premier tri passe, le second reçoit « le dossier a changé entre-temps » | ligne verrouillée, OT002 |
| Sans fiche | Pas de tri tant que la fiche de la version courante n'existe pas | OT001, rien n'est écrit |
| Refus | Définitif : une case « Je confirme » est demandée (pas de fenêtre du navigateur) | action `trier` |
| À corriger | Les points à revoir, le message et les commentaires sont validés **avant** le tri ; puis le lien est créé (usage unique, 7 jours, deux boucles au plus). Si deux corrections ont déjà été faites, l'option est remplacée par un message | `trierACorriger` ; `REGLES_CORRECTION` |
| Lien non créé | Le dossier reste à corriger ; le panneau propose « Envoyer un lien de correction » | `envoyerLienCorrection` |
| Message au client | Prérempli avec les points flous de la fiche, relu et réécrit par le conseiller ; lu par le client : rien d'interne | `panneauTri.tsx` |
| Mail | Texte fixe, sans IA, ouvert dans la messagerie du conseiller (mailto) et relu avant envoi ; le lien n'est affiché qu'une fois | `messageCorrection.ts` |

## Hors de ce ticket

- Mails modèles des autres étapes (rendez-vous, proposition, confirmation) et « marquer envoyé » : E5.4.
- Afficher dans l'historique le détail des événements autres que les statuts (aujourd'hui : « mail ») : à faire avec E5.4.
