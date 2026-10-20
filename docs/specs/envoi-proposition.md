# Confirmer les tarifs et n'envoyer que des prix vérifiés (E5.1), remplacer une ligne (E5.2)

Cas d'usage : `src/application/tarifs.ts`. Base : `supabase/migrations/20261020190000_tarifs_envoi.sql`. Écran : page de la proposition (`app/conseiller/propositions/[id]`), colonne « Tarif » et panneau d'envoi.

## Ligne par ligne

| Action | Depuis | Vers | Prix, source |
| --- | --- | --- | --- |
| Accepter le prix revérifié par l'agent | à vérifier, dernière vérification `ok` | confirmé | prix de l'agent, source `agent` |
| Accepter une indisponibilité constatée par l'agent | à vérifier, dernière vérification `indisponible` | indisponible | — |
| Saisir un tarif | à vérifier | confirmé | prix par personne en euros (`35`, `35,50`), source `telephone`, `mail` ou `lien` |
| Marquer indisponible | à vérifier, confirmé | indisponible | le tarif confirmé est effacé |
| Repasser à vérifier | confirmé, indisponible | à vérifier | le tarif confirmé est effacé |

- La **date** et l'**auteur** du tarif sont posés par la base (`confirme_le = now()`, `confirme_par`). Une contrainte en base impose prix, source, date et auteur ensemble.
- Une vérification en échec ne donne aucun prix à accepter : il faut revérifier ou saisir un tarif.
- La saisie est convertie en centimes sans flottant ; « agent » n'est pas une source saisissable.
- Les transitions suivent `TRANSITIONS_LIGNE` (`types/transitions.ts`).

## Après chaque changement

1. La base recalcule le **total** : somme des lignes hors `remplacee` et `indisponible`, sans marge (`docs/specs/chiffrage.md`).
2. La base fait suivre le **statut de la proposition** (par `changer_statut`, journal compris) : `a_verifier → prete` quand plus aucune ligne n'est à vérifier ni indisponible ; `prete → a_verifier` sinon.
3. Le code recalcule les **alertes** avec `chiffrer` (E4.2) et les enregistre.

La proposition est verrouillée pendant l'écriture : deux changements de lignes ne se croisent pas. Une proposition envoyée (ou au-delà) ne se modifie plus.

## Remplacer une ligne indisponible (E5.2)

Cas d'usage : `remplacerLigne` (`src/application/tarifs.ts`). Base : `remplacer_ligne` (`supabase/migrations/20261020200000_remplacer_ligne.sql`). Écran : « Remplacer la prestation » sur une ligne indisponible.

| Étape | Effet |
| --- | --- |
| Le conseiller choisit une prestation et, s'il le veut, une autre date | La liste propose les prestations actives de la même destination : la même prestation d'abord (pour une autre date), puis celles du même type, puis les autres |
| L'ancienne ligne | `indisponible → remplacee` (transition `TRANSITIONS_LIGNE`, Should) ; elle reste affichée, barrée, et sort du total |
| La nouvelle ligne | Créée `a_verifier`, au prix du catalogue copié ; même date et mêmes participants sauf date choisie |
| Les autres lignes | **Intactes**, tarifs confirmés compris |
| Ensuite | Comme après tout changement : total et statut de la proposition recalculés par la base, alertes par le code. La nouvelle ligne se vérifie et se confirme comme les autres |

Refus, sans rien écrire : ligne qui n'est pas indisponible ; proposition envoyée (OT008) ; prestation inconnue ou retirée du catalogue (OT010) ; même prestation à la même date (OT011) ; saisie invalide.

## Envoi

| Règle | Où c'est garanti |
| --- | --- |
| Bouton « Envoyer au client » désactivé tant qu'une ligne est à vérifier ou indisponible, ou qu'une alerte bloque ; les raisons sont listées | `etatEnvoi` ; `PanneauEnvoi` |
| Même si le bouton est contourné, l'envoi est **refusé et le statut ne change pas** | `envoyerProposition` recalcule tout ; `envoyer_proposition` (SQL) revérifie lignes et alertes bloquantes (OT009) |
| `prete → envoyee` au nom du conseiller, avec `envoyee_le` et `envoyee_par` | `envoyer_proposition` → `changer_statut` |
| Alertes bloquantes : mêmes codes en base et dans le code | test « la base refuse les mêmes alertes bloquantes que le code » |

L'envoi marque la proposition envoyée. Le mail au client part de la messagerie du conseiller (modèles : E5.4).

## Démonstration

- Dossier 9 (seed) : proposition à vérifier, deux lignes à vérifier et une indisponible : l'envoi est bloqué, avec les raisons.
- Dossier 10 : proposition prête, tous les tarifs confirmés : l'envoi passe.
