# Matrice des transitions autorisées (E0.8)

Source de vérité : `types/transitions.ts`, utilisée par la fonction de transition (E0.7). Un test vérifie que ce document et le fichier disent la même chose : modifier les deux dans la même PR.

**Règles communes**

- Toute transition absente de ces tableaux est **refusée** par la fonction de transition, qui n'écrit rien.
- Chaque transition acceptée écrit le nouveau statut **et** une ligne dans `historique_dossier` dans la même opération (ADR-0008).
- « conseiller » : déclenchée par un clic, avec un conseiller identifié (`auteur_id`). « systeme » : déclenchée par le code, jamais par le modèle.
- « — » dans la colonne De : création de la ligne.
- La garde est vérifiée par le code avant d'écrire ; la base porte en plus ses propres contraintes (migration).
- Priorité : seules les transitions **must** sont dans le sprint ; should et could restent refusées tant qu'elles ne sont pas livrées.

## Dossier (`dossiers.statut`)

| De | Vers | Par | Déclencheur | Garde | Priorité |
| --- | --- | --- | --- | --- | --- |
| — | nouvelle | systeme | formulaire envoyé | consentements RGPD et IA donnés | must |
| nouvelle | fiche_en_cours | systeme | génération de la fiche lancée | — | must |
| fiche_en_cours | fiche_prete | systeme | fiche écrite | JSON conforme à FicheIA | must |
| fiche_en_cours | erreur | systeme | génération échouée après un nouvel essai | — | must |
| erreur | fiche_en_cours | conseiller | bouton « relancer » | — | must |
| fiche_prete | validee | conseiller | tri : validée | — | must |
| fiche_prete | a_corriger | conseiller | tri : à corriger | — | must |
| fiche_prete | refusee | conseiller | tri : refus définitif | — | must |
| a_corriger | validee | conseiller | réponse du client reportée dans la fiche | — | must |
| a_corriger | refusee | conseiller | pas de correction possible | — | must |
| a_corriger | fiche_en_cours | systeme | nouvelle version de la demande reçue | version précédente marquée remplacee_le | should |
| validee | rdv_propose | conseiller | rendez-vous proposé au client | — | must |
| rdv_propose | entretien_fait | conseiller | entretien de cadrage terminé | — | must |
| entretien_fait | en_proposition | conseiller | fiche corrigée et validée | budget_reel_cents, dates fixes et validee_par renseignés | must |
| en_proposition | gagnee | systeme | dernière ligne réservée | toutes les lignes de la proposition acceptée sont reservee | must |
| a_corriger | abandonnee | conseiller | abandon confirmé | — | could |
| validee | abandonnee | conseiller | abandon confirmé | — | could |
| rdv_propose | abandonnee | conseiller | abandon confirmé | — | could |
| entretien_fait | abandonnee | conseiller | abandon confirmé | — | could |
| en_proposition | abandonnee | conseiller | abandon confirmé (proposition sans réponse) | — | could |

États finaux : `refusee`, `gagnee`, `abandonnee`. Valeurs couvertes : 12.

## Proposition (`propositions.statut`)

| De | Vers | Par | Déclencheur | Garde | Priorité |
| --- | --- | --- | --- | --- | --- |
| — | brouillon_en_cours | systeme | brouillon demandé par le conseiller | dossier en_proposition | must |
| brouillon_en_cours | brouillon_pret | systeme | brouillon écrit | JSON conforme à BrouillonIA, prestations dans la liste fournie | must |
| brouillon_en_cours | erreur | systeme | génération échouée après un nouvel essai | — | must |
| erreur | brouillon_en_cours | conseiller | bouton « relancer » | — | must |
| brouillon_pret | a_verifier | systeme | lignes chiffrées par le code | toutes les lignes créées à a_verifier | must |
| a_verifier | prete | systeme | dernière ligne confirmée | aucune ligne a_verifier ni indisponible | must |
| prete | a_verifier | systeme | une ligne ajoutée ou repassée à vérifier | — | must |
| prete | envoyee | conseiller | envoi au client | aucune ligne a_verifier ni indisponible | must |
| envoyee | acceptee | conseiller | acceptation du client enregistrée | — | must |
| envoyee | changement_demande | conseiller | le client demande un changement | — | must (E6.1) |
| envoyee | sans_reponse | systeme | rappel à J+3 | — | should |
| sans_reponse | acceptee | conseiller | acceptation du client enregistrée | — | should |
| sans_reponse | changement_demande | conseiller | le client demande un changement | — | should |
| changement_demande | remplacee | systeme | version suivante créée | version suivante en brouillon_en_cours | must (E6.1) |
| acceptee | depot_recu | conseiller | dépôt de garantie reçu | — | must |
| depot_recu | reservee | systeme | dernière ligne réservée | toutes les lignes sont reservee | must |

États finaux : `remplacee`, `reservee`. Valeurs couvertes : 12.

## Ligne de proposition (`proposition_lignes.statut`)

| De | Vers | Par | Déclencheur | Garde | Priorité |
| --- | --- | --- | --- | --- | --- |
| — | a_verifier | systeme | ligne créée par le brouillon | prestation du catalogue, prix catalogue copié | must |
| a_verifier | confirme | conseiller | tarif accepté depuis l’agent ou saisi | prix_confirme_cents, source, confirme_le et confirme_par renseignés | must |
| a_verifier | indisponible | conseiller | vérification « indisponible » acceptée | — | must |
| confirme | a_verifier | conseiller | nouvelle vérification demandée avant envoi | proposition pas encore envoyée | must |
| confirme | indisponible | conseiller | prestation devenue indisponible avant la réservation | — | must |
| confirme | reservee | systeme | option confirmée sur le simulateur | option de la ligne en confirmee | must |
| indisponible | a_verifier | conseiller | nouvelle vérification demandée | — | must |
| indisponible | remplacee | conseiller | ligne remplacée par une autre prestation | nouvelle ligne créée | should |

États finaux : `remplacee`, `reservee`. Valeurs couvertes : 5.

## Accord, option et réservation (`options.statut`)

| De | Vers | Par | Déclencheur | Garde | Priorité |
| --- | --- | --- | --- | --- | --- |
| — | accord_donne | conseiller | accord donné sur l’écran de proposition | proposition depot_recu, vérification ok récente, aucune démarche en cours sur la ligne | must |
| accord_donne | posee | systeme | POST /api/v1/options réussi | accord non expiré et non utilisé ; accord_utilise passe à vrai | must |
| accord_donne | echec | systeme | accord expiré ou option refusée par le simulateur | — | must |
| posee | confirmee | conseiller | seconde validation avec la clé d’approbation | option non expirée et prix_option_cents = prix_accorde_cents | must |
| posee | expiree | systeme | expire_le dépassé ou refus option_expired | — | must |
| posee | echec | systeme | prix de l’option différent du prix accordé | — | must |
| confirmee | annulee | conseiller | annulation avec la clé d’approbation | — | could |

États finaux : `expiree`, `echec`, `annulee`. Valeurs couvertes : 6.

## Fonction de transition (E0.7)

Tout changement de statut d'un dossier ou d'une proposition passe par `changerStatut` (`src/application/changerStatut.ts`). Aucun autre code n'écrit `dossiers.statut`, `propositions.statut` ni les lignes `statut` de `historique_dossier`.

1. Le statut actuel est lu.
2. La règle pure `verifierTransition` (`src/domain/transition.ts`) cherche la transition dans la matrice ci-dessus.
3. Si elle est acceptée, la fonction SQL `changer_statut` (migration `20261019130000_fonction_transition.sql`) écrit le statut et la ligne d'historique dans la même transaction : les deux, ou rien. Elle verrouille la ligne et refuse l'écriture si le statut a changé depuis la lecture. Seul le serveur (`service_role`) peut l'appeler.

Résultat en cas de refus (rien n'est écrit) :

- `transition_interdite` : absente de la matrice, ou déclenchée par le mauvais auteur ;
- `transition_non_livree` : dans la matrice, mais de priorité should ou could (`PRIORITES_LIVREES` vaut `['must']`) ;
- `auteur_non_identifie` : transition « conseiller » sans identifiant de conseiller ;
- `introuvable` : le dossier ou la proposition n'existe pas ;
- `statut_modifie` : une autre transition est passée entre la lecture et l'écriture.

Le détail de la ligne d'historique suit `DetailEvenement` (`types/historique.ts`) ; un tri depuis `fiche_prete` y ajoute la `decision`. Les gardes de la colonne Garde restent vérifiées par le cas d'usage appelant, avant `changerStatut`. Les créations (« — ») et les statuts des lignes et des options, journalisés par leurs propres événements (`verification`, `accord`, `option`, `reservation`), ne passent pas encore par cette fonction.

## Limites connues du MVP

- Une ligne `indisponible` bloque l'envoi : le conseiller la revérifie, ou la remplace (E5.2, `remplacer_ligne` : la ligne passe à `remplacee` et une nouvelle ligne naît `a_verifier`).
- La durée de l'option n'est pas codée : l'expiration vient de `expire_le` renvoyé par le simulateur.
