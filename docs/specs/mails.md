# Mails modèles ouverts dans la messagerie du conseiller (E5.4)

Textes : `src/domain/mails.ts`. Journal : `supabase/migrations/20261020200000_mails_envoyes.sql`. Écrans : fiche du dossier, panneau de tri, page de la proposition, version imprimable.

## Principe

Aucun mail ne part de l'application. Le conseiller voit l'**aperçu**, ouvre le mail **dans sa messagerie** (lien `mailto`), le relit, le complète et l'envoie lui-même, puis clique **« Marquer comme envoyé »** : l'envoi est journalisé. Pas de fournisseur de mails, pas de clé.

Les quatre textes sont **fixes**, écrits dans le code : **aucun texte produit par l'IA**.

## Les quatre modèles

| Modèle | Où | Quand | Contenu | « Marquer envoyé » |
| --- | --- | --- | --- | --- |
| Rendez-vous | fiche du dossier | dossier validé (ou rendez-vous déjà proposé) | séjour demandé, proposition d'entretien, créneaux **à compléter** | journalisé ; un dossier validé passe en **rendez-vous proposé** |
| Demande à corriger | panneau de tri, après la création du lien (E3.1) | dossier à corriger | message du conseiller, **chaque point avec son commentaire**, lien de correction et sa date limite | journalisé |
| Proposition | page de la proposition | proposition **envoyée** (E5.1) ou au-delà | prestations, dates, participants, **prix vérifiés**, total ; le programme est dans le PDF joint | journalisé |
| Confirmation | fiche du dossier | proposition **réservée** | prestations réservées et total | journalisé |

## Rien ne part avec un prix non vérifié

- Les mails de proposition et de confirmation n'écrivent que des **tarifs confirmés** (E5.1) : une ligne à vérifier ou sans prix confirmé rend le mail impossible (`MailImpossibleErreur`), il n'est pas proposé. Aucun prix catalogue ni estimé.
- Les lignes indisponibles ou remplacées n'apparaissent pas.
- La confirmation n'accepte que des lignes réservées.
- En base, `marquer_mail_envoye` refuse un mail sans objet à l'étape du dossier (OT010) : rendez-vous sur un dossier non validé, proposition non envoyée, confirmation d'une proposition non réservée, proposition d'un autre dossier.

## Version imprimable (PDF)

`/conseiller/propositions/[id]/imprimer` : programme, prestations aux prix vérifiés, total ; bouton « Imprimer ou enregistrer en PDF » (impression du navigateur). Refusée tant qu'un prix n'est pas vérifié. Le PDF se joint au mail de la proposition.

## Historique

Le journal garde le modèle, rien d'autre (`{"type": "mail", "modele": "rendez_vous"}`). La fiche du dossier l'affiche lisiblement : « Mail « Rendez-vous » envoyé », « Lien de correction créé : Budget, Dates du séjour (correction 1/2) » (`resumeEvenement`).
