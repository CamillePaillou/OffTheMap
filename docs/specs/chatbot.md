# Chatbot du site (E1.3)

Un assistant sur le site public (bouton « Une question ? », en bas à droite) : il **répond aux questions sur l'offre à partir du catalogue des prestataires** (que faire à Lyon, où dormir à Nantes, une activité en intérieur…), vérifie si une prestation est disponible à une date, puis mène au formulaire de demande (E1.1), prérempli. Il ne remplace pas le conseiller : il ne donne aucun prix et ne réserve rien.

## Ce qu'il utilise (préparé par le formateur)

| Source | Usage |
| --- | --- |
| API prestataires (simulateur, dépôt `PANDORMedia/detour`), par notre adaptateur (E0.17) | `GET /api/v1/catalogue` et `GET /api/v1/disponibilites`, **en lecture seule** |
| Catalogue importé par l'agence (table `prestations`) | **Secours du catalogue** quand le simulateur ne répond pas ou que la clé d'équipe manque : seules les colonnes sans prix sont lues (`src/infrastructure/db/catalogueSupabase.ts`). Les disponibilités, elles, ne viennent que du simulateur |
| Site vitrine du formateur (`site/agence.html`, `destinations.html`, `contact.html`) | Présentation de l'agence, destinations, horaires et contact, repris dans `src/domain/chatbot/connaissances.ts`, **sans les prix « à partir de »** |

Briques réutilisées : port `ModeleAgent` et adaptateur OpenRouter (E0.13, E0.19 : modèles gratuits, sans secours payant), boucle à outils bornée sur le modèle de l'agent de vérification (E8.3).

## Parcours

1. Le navigateur envoie la conversation à `POST /api/chatbot` (12 derniers messages, 600 caractères au plus pour le dernier). Rien n'est stocké : ni cookie, ni base, ni journal de conversation.
2. Le serveur minimise chaque message (`minimiser`) puis appelle le modèle avec deux outils.
3. Le code valide chaque appel d'outil avant de toucher au simulateur, puis renvoie au modèle un résultat **sans prix ni nombre de places**.
4. La réponse du modèle passe par `sansPrix`, puis repart vers le navigateur avec, s'il y a lieu, le résultat de la vérification et une suggestion de préremplissage.
5. Le bouton « Composer mon week-end » ouvre `/demande?destination=…&date_debut=…&adultes=…` ; la page contrôle ces valeurs, le client relit et complète.

## Outils

| Outil | Arguments (validés par le code) | Ce que le modèle reçoit |
| --- | --- | --- |
| `chercher_prestations` | `destination` (Nantes, Lyon, Lille), `type` et `mots` (mots-clés cherchés dans le nom, la description et les étiquettes) facultatifs | id, nom, type, destination, description, étiquettes : **jamais le prix ni la capacité** (retirés avant même la recherche, `catalogueAvecSecours`) |
| `verifier_disponibilite` | `prestation_id`, `date` (AAAA-MM-JJ, réelle, pas passée), `participants` (1 à 20) | `disponible` : oui ou non, **sans prix ni places** |

Tout autre outil (poser une option, réserver, annuler) est refusé : il n'existe pas pour le chatbot, et le cas d'usage ne reçoit que `catalogue` et `disponibilite` du port `Prestataires`.

## Rapidité et lisibilité

- **Réponses rapides d'abord** (`ModeleHybride`, avec `LLM_PROVIDER=openrouter`) : les questions que le modèle de règles comprend (une ville, un type, un mot-clé, une date, le prix, la réservation, les horaires, « bonjour ») sont traitées sans appel réseau, en moins d'une seconde. Les autres vont au modèle principal seul (sans réserve), avec `CHATBOT_TIMEOUT_MS` (8 s par défaut). S'il échoue ou si le message dépasse 15 s, les règles terminent la réponse avec le catalogue.
- **Un aller-retour de moins** : le catalogue (sans prix) est lu une fois par message et donné au modèle dans ses consignes ; `chercher_prestations` filtre ce catalogue sans rappeler le simulateur.
- **Texte court, cartes en dessous** : la réponse tient en une ou deux phrases. Les prestations dont elle parle (résultats d'outil, ou noms cités par le modèle et retrouvés dans le catalogue) s'affichent en cartes : type, ville, nom, une ligne de description, et le résultat de la vérification s'il y en a eu une. Une carte ouvre le formulaire prérempli avec la ville, la prestation (« Ce qui me tente : … »), la date et les voyageurs.
- **Réponses rapides** : deux ou trois suggestions calculées par le code après chaque réponse (« Où dormir à Lyon ? », « Libre le 7 novembre pour 2 ? », « Et le 14 novembre ? », « Et à Lille ? »), toutes comprises par les règles, donc instantanées.
- **Jamais coupé en plein mot** : au-delà de 900 caractères, coupure en fin de phrase ; les lignes « - … » du modèle s'affichent en liste à puces.

## Règles

- **Aucun prix** : ni dans ce que reçoit le modèle, ni dans ce qu'il répond (un montant écrit quand même est remplacé par « prix communiqué par un conseiller »).
- **Aucune donnée personnelle vers le modèle** : e-mail, téléphone, numéro long (carte, IBAN), nom donné spontanément et informations de santé (allergie, grossesse, diabète…, avec leur complément) sont remplacés avant l'envoi.
- **Clés côté serveur** : clé OpenRouter et clé d'équipe lues par la route ; jamais renvoyées au navigateur ni écrites dans un prompt.
- **Bornes** : 3 appels d'outil au plus par message, puis le modèle doit conclure sans outil ; réponse de 900 caractères au plus.
- **Répondre, pas renvoyer** : une question sur l'offre reçoit la liste de ce que le catalogue propose ; le conseiller n'est proposé que pour le prix, la réservation, ou ce que le catalogue ne dit pas.
- **Pannes** : catalogue du simulateur indisponible, le catalogue de l'agence prend le relais ; les deux indisponibles, ou disponibilité impossible à vérifier, réponse fixe « Je n'ai pas pu joindre nos prestataires… » (écrite par le code, sans prix ni places) ; modèle injoignable ou mal configuré, réponse fixe qui renvoie vers le formulaire. Aucun nouvel essai.
- **Accessibilité** : bouton et panneau au clavier, Échap ferme et rend le focus, réponses annoncées (`aria-live`), utilisable sur téléphone, animations coupées si l'ordinateur le demande.
- Le chatbot n'apparaît ni dans l'espace conseiller ni sur le formulaire (il y mène).

## En développement et en démonstration

- `LLM_PROVIDER=fake` (par défaut) : `FauxModeleChat`, sans réseau ni clé, qui répond vraiment avec le catalogue. Il comprend une destination, un type (« hôtel », « que faire », « le train »), des mots-clés (« quand il pleut » → intérieur, « gourmand » → cuisine, « calme » → sans effort…), une date (« 7 novembre », « 07/11 ») et un nombre de voyageurs (« pour deux ») ; il liste les prestations qui correspondent, par ville, avec leur description, puis vérifie la disponibilité de celle qui répond à la question. Sans résultat pour un mot-clé, il montre ce qui existe dans la ville. Il refuse de réserver et de donner un prix.
- `LLM_PROVIDER=openrouter` : le vrai modèle. Essai réel : `make essai-chatbot` (simulateur lancé) ; `make essai-chatbot PANNE=delai` pour la panne.
- Sans `SIMULATEUR_TEAM_KEY`, le chatbot répond sur l'offre avec le catalogue de l'agence (base Supabase) et dit qu'il n'a pas pu vérifier les disponibilités.

## Tests

`src/domain/chatbot/chatbot.test.ts` (minimisation, prix, outils), `src/application/repondreChatbot.test.ts` (les 4 scénarios de l'issue, pannes, bornes), `src/infrastructure/llm/faux-modele-chat.test.ts` (questions sur l'offre, mots-clés, disponibilité, avec le catalogue de démonstration), `src/infrastructure/prestataires/catalogueChatbot.test.ts` (prix retirés, secours du catalogue).
