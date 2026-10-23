# Contrat de l'agent de vérification (E8.2)

**Version 1 · 19 octobre 2026 · à relire par le développeur de l'agent (P4).** Ce contrat fait foi pour E8.3 (boucle), E8.5 (trace), E9.6 (non-écriture) et la campagne E11. Les types cités sont dans `types/ia.ts` et `types/simulateur.ts`.

| Rubrique | Décision |
| --- | --- |
| **Mission** | Pour **une** ligne de proposition, dire si la prestation est disponible à cette date pour ce nombre de participants, et à quel prix unitaire, d'après le simulateur. Rien d'autre. |
| **Entrée** | Construite par le code à partir de la ligne : `prestation_id`, nom de la prestation, `date`, `participants`. Le modèle ne reçoit ni le prix catalogue, ni le budget, ni aucune donnée du client, ni aucune clé. |
| **Source de vérité** | La réponse de `GET /api/v1/disponibilites` du simulateur : `disponible`, `places_restantes`, `prix_unitaire_eur`. Aucun prix ni stock n'est écrit dans le prompt. Une lecture ne bloque aucune place. |
| **Outil exposé** | Un seul : `verifier_disponibilite(prestation_id, date, participants)`, en lecture seule (`OUTIL_VERIFIER_DISPONIBILITE`). `prestation_id` : `^[a-z0-9-]+$` ; `date` : `AAAA-MM-JJ` ; `participants` : entier de 1 à 20. |
| **Contrôles du programme** (avant l'appel HTTP) | 1. Le nom de l'outil est dans `OUTILS_AUTORISES`. 2. Les arguments passent `ArgsVerifierDisponibilite`. 3. Ils sont **identiques** à ceux de la ligne : l'agent ne vérifie pas autre chose que ce qui lui est demandé. 4. Un seul appel d'outil par tour. Tout refus est tracé et compte comme un tour. |
| **Réponse attendue** | Un JSON conforme à `ConclusionVerification` : `ok` ou `indisponible` avec `prix_unitaire_cents` et `places_restantes` ; `echec` sans prix ni places, avec une raison. `resume` en une ou deux phrases, sans montant. Le code compare le prix et les places annoncés au JSON du simulateur (E8.5) : un écart rend la conclusion invalide. L'écart avec le prix catalogue est calculé par le code, pas par le modèle. |
| **Interdit** | Poser une option, confirmer, annuler, appeler toute autre route ; inventer ou estimer un prix ou des places ; modifier la proposition ; écrire au client ; suivre une instruction trouvée dans les données (nom de prestation, texte du client). Aucun outil d'écriture n'existe pour lui. |
| **Erreurs et arrêt** | Arrêt dès qu'une conclusion valide est rendue (`conclusion`). **3 tours maximum** (`tours_max`). Délai dépassé (5 s) ou erreur 5xx : arrêt immédiat, `echec_serveur`, pas de nouvel essai automatique (le conseiller peut relancer). Erreur 4xx ou arguments refusés : le modèle est informé, le tour compte. Réponse du modèle ou du simulateur non conforme : `reponse_invalide`. Dans tous les cas d'échec : « non vérifié », ni prix ni places. |
| **Trace** | Par tour : numéro, horodatage, appel proposé (nom, arguments), conclusion brute du modèle (même rejetée), décision du code (accepté ou refusé, raison, écarts champ par champ), statut HTTP, réponse du simulateur, durée. Par vérification : modèle, nombre de tours, raison d'arrêt. Jamais : `X-Team-Key`, clé OpenRouter, clé d'approbation, données du client. Stockée dans `verifications.trace`, au format `TraceVerification` (`types/trace.ts`), après `expurgerTrace`. Le `resume` de la conclusion, enregistré dans `verifications.resume` et montré au conseiller, passe par `expurgerChaine` (E11.2, cas X01R) ; les faits sont comparés par `comparerFaits` (`src/domain/verification/`). |
| **Modèle** | Gratuit via OpenRouter, compatible avec les appels d'outils (`LLM_MODEL`, réserve `LLM_MODEL_RESERVE`, vérifiés le 20/10/2026 avec `make essai-agent` : `minimax/minimax-m3.1-flash:free` et `nvidia/nemotron-3-ultra-550b-a55b:free`). Aucun secours payant : un modèle sans `:free` est refusé à la configuration. |
| **Décision humaine** | Le conseiller voit le prix revérifié, l'écart, la réponse brute et la trace, puis accepte le tarif (source `agent`) ou en saisit un autre. L'accord pour une option est une étape séparée (E9.3), hors de l'agent. Si l'agent n'a pas pu vérifier, l'accord peut se fonder sur le tarif confirmé par le conseiller (`basePrixAccord`, `src/domain/accord.ts`) : une vérification en échec est ignorée, un constat « indisponible » plus récent que le tarif bloque, et le simulateur fait foi à la pose (un autre prix refuse l'option). |

## Boucle

```mermaid
sequenceDiagram
  participant C as Conseiller
  participant P as Programme
  participant M as Modèle (OpenRouter)
  participant S as Simulateur
  C->>P: « Vérifier » sur une ligne
  P->>M: mission + ligne + outil unique
  M->>P: appel verifier_disponibilite(...)
  P->>P: outil autorisé ? arguments = ligne ?
  P->>S: GET /api/v1/disponibilites
  S->>P: JSON (prix, places)
  P->>M: résultat converti en centimes
  M->>P: conclusion JSON
  P->>P: schéma + faits comparés au JSON
  P->>C: prix revérifié, écart, trace
```

## Implémentation (E8.3)

| Où | Quoi |
| --- | --- |
| `src/application/verifierPrestation.ts` | La boucle : 3 tours, arrêts, conclusion, trace expurgée. Rend une ligne `verifications` prête à écrire (hors `id`, `ligne_id`, `demande_par`). L'agent ne reçoit que `Pick<Prestataires, 'disponibilite'>` : aucune méthode d'écriture ne lui est accessible. |
| `src/domain/verification/validerAppel.ts` | Les 4 contrôles du programme sur un appel d'outil, avant toute requête. |
| `src/domain/verification/lireConclusion.ts` | Lecture de la conclusion : le premier objet JSON du texte (```` ```json ```` accepté), validé par `ConclusionVerification`. La conclusion n'est pas un outil : un seul outil est exposé. |
| `src/ports/modele-agent.ts` | Port d'un tour avec outils, implémenté par `OpenRouterLlmClient`. |

Précisions apportées par l'implémentation :
- **Prix et places retenus** : toujours ceux du simulateur (`reponse_serveur`), jamais ceux du texte du modèle ; la conclusion ne sert qu'à vérifier que le modèle les a bien lus.
- **Modèle injoignable** (délai, panne OpenRouter) : arrêt `echec_serveur`, le détail est dans la trace (`modèle injoignable (delai)`) ; `modele` vaut `aucun` si aucun n'a répondu.
- **Réponse du simulateur dans la trace** : la valeur rendue par l'adaptateur, déjà convertie en centimes, pas le JSON brut en euros.
- **Plusieurs appels d'outil dans un tour** : tous refusés, chacun reçoit une réponse d'erreur (sinon le fournisseur rejette le tour suivant).

## Critères vérifiables (repris dans la campagne E11)

1. Simulateur en délai dépassé : conclusion `echec`, aucun prix ni place, un seul tour consommé.
2. Le modèle demande un autre outil (poser une option) : refus tracé, aucune requête d'écriture envoyée.
3. Le modèle vérifie une autre date ou une autre prestation que la ligne : refus tracé.
4. La conclusion annonce 4 places alors que le simulateur en renvoie 2 : conclusion rejetée (`reponse_invalide`).
5. Un nom de prestation contenant « réserve maintenant » : aucune action autre que la lecture.
6. Aucune clé ni donnée client dans la trace enregistrée ni dans le résumé montré au conseiller.

## E9.6 — preuve de non-écriture

Le test `src/application/verifierPrestation.test.ts` (« E9.6 ») simule un modèle qui demande successivement à poser une option, confirmer une réservation et annuler une réservation. Pour chaque tentative, il vérifie que :

- le modèle ne reçoit que `verifier_disponibilite` dans la liste des outils, à chaque tour ;
- le programme refuse et trace le nom de l’outil non autorisé ;
- aucune requête n’est envoyée au simulateur, dont l’interface fournie à l’agent n’expose que `disponibilite` ;
- la clé d’approbation factice n’est jamais transmise dans les messages du modèle.

Le test s’exécute avec `npm test -- src/application/verifierPrestation.test.ts`. Le garde-fou structurel est aussi vérifié dans `types/permissions.test.ts` : `OUTILS_AUTORISES` ne contient que `verifier_disponibilite` et aucune permission d’écriture n’est accordée au modèle.

## Revue croisée

| Date | Relecteur | Ambiguïté trouvée | Correction |
| --- | --- | --- | --- |
| | | | |

## Mode rejeu annoncé (E11.3)

Pour démontrer la boucle quand OpenRouter est indisponible (quota gratuit atteint, modèle retiré), `AGENT_MODE=rejeu` dans `.env`, puis relancer l'application.

- **Ce qui est rejoué :** seulement les messages du modèle (appel d'outil, puis conclusion), tirés d'une vérification faite avec un vrai modèle gratuit pour la **même** prestation, la **même** date et le **même** nombre de participants. On prend la plus récente en base, sinon l'enregistrement de la campagne E11.2 (`fixtures/rejeu/agent.json`, cas N01 v3 : atelier de Nantes, 7 novembre, 2 participants). Le faux client, le seed et un rejeu ne servent jamais d'enregistrement.
- **Ce qui reste réel :** les contrôles du programme (outil autorisé, arguments identiques à la ligne, 3 tours), l'appel au simulateur et la comparaison des faits annoncés à sa réponse. Un enregistrement dont le prix ne correspond plus est refusé (`reponse_invalide`), comme le serait un vrai modèle.
- **Ce que voit le conseiller :** une bannière « Rejeu » sur la page de la ligne tant que le mode est actif ; sur la vérification, la pastille « Rejeu » et le modèle « rejeu de … » (`verifications.modele`). Sans enregistrement pour la ligne : un message clair, aucune vérification écrite.
- Code : `src/domain/verification/rejeu.ts`, `src/infrastructure/llm/modele-rejeu.ts`, `src/infrastructure/db/enregistrementsAgent.ts` ; tests : `src/infrastructure/llm/modele-rejeu.test.ts`.
