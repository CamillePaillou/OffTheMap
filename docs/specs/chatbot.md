# Chatbot du site (E1.3)

Un assistant sur le site public (bouton « Une question ? », en bas à droite) : il présente l'agence et ses destinations, et vérifie si une prestation est disponible à une date, puis mène au formulaire de demande (E1.1), prérempli. Il ne remplace pas le conseiller : il ne donne aucun prix et ne réserve rien.

## Ce qu'il utilise (préparé par le formateur)

| Source | Usage |
| --- | --- |
| API prestataires (simulateur, dépôt `PANDORMedia/detour`), par notre adaptateur (E0.17) | `GET /api/v1/catalogue` et `GET /api/v1/disponibilites`, **en lecture seule** |
| Site vitrine du formateur (`site/agence.html`, `destinations.html`, `contact.html`) | Présentation de l'agence, destinations, horaires et contact, repris dans `src/domain/chatbot/connaissances.ts`, **sans les prix « à partir de »** |

Briques réutilisées : port `ModeleAgent` et adaptateur OpenRouter (E0.13, E0.19 : modèles gratuits, sans secours payant), boucle à outils bornée sur le modèle de l'agent de vérification (E8.3).

## Parcours

1. Le navigateur envoie la conversation à `POST /api/chatbot` (12 derniers messages, 600 caractères au plus pour le dernier). Rien n'est stocké : ni cookie, ni base, ni journal de conversation.
2. Le serveur minimise chaque message (`minimiser`) puis appelle le modèle avec deux outils.
3. Le code valide chaque appel d'outil avant de toucher au simulateur, puis renvoie au modèle un résultat **sans prix ni nombre de places**.
4. La réponse du modèle passe par `sansPrix`, puis repart vers le navigateur avec, s'il y a lieu, le résultat de la vérification et une suggestion de préremplissage.
5. Le bouton « Décrire mon week-end » ouvre `/demande?destination=…&date_debut=…&adultes=…` ; la page contrôle ces valeurs, le client relit et complète.

## Outils

| Outil | Arguments (validés par le code) | Ce que le modèle reçoit |
| --- | --- | --- |
| `chercher_prestations` | `destination` (Nantes, Lyon, Lille) et `type` facultatifs | id, nom, type, destination, description : **jamais le prix ni la capacité** |
| `verifier_disponibilite` | `prestation_id`, `date` (AAAA-MM-JJ, réelle, pas passée), `participants` (1 à 20) | `disponible` : oui ou non, **sans prix ni places** |

Tout autre outil (poser une option, réserver, annuler) est refusé : il n'existe pas pour le chatbot, et le cas d'usage ne reçoit que `catalogue` et `disponibilite` du port `Prestataires`.

## Règles

- **Aucun prix** : ni dans ce que reçoit le modèle, ni dans ce qu'il répond (un montant écrit quand même est remplacé par « prix communiqué par un conseiller »).
- **Aucune donnée personnelle vers le modèle** : e-mail, téléphone, numéro long (carte, IBAN), nom donné spontanément et informations de santé (allergie, grossesse, diabète…, avec leur complément) sont remplacés avant l'envoi.
- **Clés côté serveur** : clé OpenRouter et clé d'équipe lues par la route ; jamais renvoyées au navigateur ni écrites dans un prompt.
- **Bornes** : 3 appels d'outil au plus par message, puis le modèle doit conclure sans outil ; réponse de 900 caractères au plus.
- **Pannes** : simulateur en délai, en erreur ou illisible, réponse fixe « Je n'ai pas pu vérifier… » (écrite par le code, sans prix ni places) ; modèle injoignable ou mal configuré, réponse fixe qui renvoie vers le formulaire. Aucun nouvel essai.
- **Accessibilité** : bouton et panneau au clavier, Échap ferme et rend le focus, réponses annoncées (`aria-live`), utilisable sur téléphone, animations coupées si l'ordinateur le demande.
- Le chatbot n'apparaît ni dans l'espace conseiller ni sur le formulaire (il y mène).

## En développement et en démonstration

- `LLM_PROVIDER=fake` (par défaut) : `FauxModeleChat`, sans réseau ni clé. Il comprend une destination, une date (« 7 novembre », « 07/11 ») et un nombre de voyageurs (« pour deux »), utilise les mêmes outils, refuse de réserver et de donner un prix. Il montre le parcours, pas la conversation.
- `LLM_PROVIDER=openrouter` : le vrai modèle. Essai réel : `make essai-chatbot` (simulateur lancé) ; `make essai-chatbot PANNE=delai` pour la panne.
- Sans `SIMULATEUR_TEAM_KEY`, le chatbot répond « non vérifié » au lieu de planter.

## Tests

`src/domain/chatbot/chatbot.test.ts` (minimisation, prix, outils), `src/application/repondreChatbot.test.ts` (les 4 scénarios de l'issue, pannes, bornes), `src/infrastructure/llm/faux-modele-chat.test.ts` (parcours complet avec le faux modèle).
