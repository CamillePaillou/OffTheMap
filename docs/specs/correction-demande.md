# Corriger ma demande depuis un lien (E1.2)

**Contrat associé** : `types/correction.ts`. Cas d'usage : `src/application/corrigerDemande.ts`. Base : `supabase/migrations/20261020120000_correction_demande.sql`.

## Parcours

```mermaid
sequenceDiagram
  participant C as Conseiller
  participant S as Serveur
  participant B as Base
  participant V as Client
  C->>S: dossier à corriger : points à revoir, motif, commentaire par point
  S->>S: jeton aléatoire (32 octets), empreinte SHA-256
  S->>B: demander_correction(empreinte, points, motif, expiration)
  S-->>C: lien /demande/corriger/<jeton> (à mettre dans le mail)
  V->>S: ouvre le lien
  S->>B: lire_correction(empreinte)
  S-->>V: formulaire prérempli, points surlignés, motif et commentaires
  V->>S: renvoie le formulaire
  S->>S: validation (comme au dépôt) ; point signalé inchangé ? alerte
  S->>B: corriger_demande(empreinte, version)
  B->>B: version n+1, version n remplacee_le, lien utilisé, a_corriger → fiche_en_cours + journal
```

## Règles

| Règle | Choix | Où c'est garanti |
| --- | --- | --- |
| Qui demande | Le conseiller, sur un dossier **à corriger** (`a_corriger`) | `demander_correction` : erreur OT004 sinon |
| Points à revoir | Au moins un parmi : e-mail, destination, dates, nuits, voyageurs, budget, envies, contraintes, alimentation, mobilité ; plus un motif de 1 à 500 caractères, **lu par le client** | `schemaDemandeCorrection` ; CHECK en base |
| Jeton | 32 octets aléatoires (base64url, 43 caractères). **Seule l'empreinte SHA-256 est stockée** : une fuite de la base ne donne aucun lien utilisable. Le jeton n'est ni journalisé ni tracé | `creerJeton`, `empreinteJeton` ; CHECK `^[0-9a-f]{64}$` |
| Usage unique | Le lien sert une fois ; ensuite la page dit « déjà envoyée » | `utilisee_le` ; `corriger_demande` verrouille la ligne (double clic sans effet) |
| Expiration | 7 jours. Un nouveau lien ferme le précédent | `expire_le` ; erreur OT006 |
| Boucles | **Deux au plus** par dossier. Au-delà, le conseiller appelle le client ou refuse le dossier | `unique (dossier_id, boucle)`, `boucle between 1 and 2` ; erreur OT005 |
| Lien clos | Si le dossier n'est plus à corriger (trié entre-temps) ou si la version visée a été remplacée | `lire_correction` renvoie `clos` ; `corriger_demande` refuse |
| Commentaire par point | Facultatif : le conseiller peut ajouter un **petit commentaire** (200 caractères) sur chaque point signalé, pour expliquer au client pourquoi ce champ ne va pas. Il s'affiche sous le champ et dans la liste en tête de page. Un commentaire ne peut porter que sur un point signalé ; les vides sont ignorés | `schemaDemandeCorrection` ; CHECK `commentaires_valides` en base |
| Motifs types (E3.3) | Pour chaque point, des motifs prêts à l'emploi (`MOTIFS_TYPES`), proposés à la saisie du commentaire : le conseiller les garde, les complète ou écrit le sien. Formulés pour le client : pourquoi le champ ne va pas, quoi faire | `types/correction.ts` ; `datalist` du panneau de tri |
| Encart d'explication (E3.3) | En tête du formulaire : « Pourquoi votre conseiller vous recontacte » (message), « Les points à revoir » (avec les commentaires), « Comment faire » (modifier, confirmer si exact, envoyer) et la date limite. Chaque champ surligné a une explication ; sans commentaire : « Merci de vérifier ce point. » | page `/demande/corriger/[jeton]` |
| Champs surlignés | Les points signalés sont surlignés (bordure ambre) et listés en tête, avec le motif ; le reste reste modifiable | `CHAMPS_FORMULAIRE` ; page `/demande/corriger/[jeton]` |
| Champ inchangé | Un point signalé renvoyé tel quel déclenche une alerte : le client confirme qu'il est exact, ou le modifie | `pointsInchanges` ; case `confirmer_inchanges` |
| Validation | Identique au dépôt (E1.1) ; les consentements sont redemandés et datés à nouveau | `validerSaisie` |
| Effet du renvoi | Version suivante de la demande ; la précédente reçoit `remplacee_le` ; dossier `a_corriger → fiche_en_cours` par le **système**, journal compris ; tout ou rien | `corriger_demande` → `changer_statut` (E0.7) |
| Fuite du lien | Page `noindex`, `Referrer-Policy: no-referrer`, rendue à chaque requête (jamais en cache) | métadonnées de la page ; `connection()` |
| Journal | « correction demandée » (type `mail`, boucle et points, **sans motif, commentaires ni jeton**), puis la transition | `historique_dossier` |

## États du lien

| État | Page affichée |
| --- | --- |
| `valide` | Formulaire prérempli |
| `inconnu` | « Ce lien n'est pas valable » (jeton mal formé : la base n'est pas interrogée) |
| `utilise` | « Votre correction a déjà été envoyée » |
| `expire` | « Ce lien a expiré, contactez votre conseiller » |
| `clos` | « Votre demande n'attend plus de correction » |

## Côté conseiller

- **Créer le lien** (E3.1, `docs/specs/tri.md`) : depuis la fiche, « À corriger » (ou « Envoyer un lien de correction » sur un dossier déjà à corriger) appelle `demanderCorrection`, puis ouvre le mail (mailto) avec l'adresse du site + `cheminCorrection(jeton)`. Le jeton n'est affiché qu'à ce moment : il n'est pas récupérable ensuite.
- **Nouvelle fiche** : le dossier repasse en `fiche_en_cours` ; la fiche de la nouvelle version est générée par E2.2, comme après un dépôt.

## Démonstration

Le seed crée un lien pour le dossier 4 (Nina Moreau, budget trop court), avec un commentaire sur le budget et un sur les nuits :
`http://localhost:3000/demande/corriger/demo-Nina-Moreau-correction-budget-E12-2026`
Jeton public réservé à la base locale ; il sert une fois et expire 7 jours après `make seed`, qui le remet à neuf.
