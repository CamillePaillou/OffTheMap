# Recette du rebranding DÉTOUR 2026

Brief client « Nous avons changé de visage » et brand kit du formateur (`PANDORMedia/detour`, branche `rebrand-2026`). À faire avec `make up`, sur ordinateur et sur téléphone (ou en largeur 390 px). Les écarts assumés sont listés dans `docs/specs/design.md`, section « Écarts ».

### 1. Logo (« le O sort du rang »)
- [ ] Partout, le logo est celui du kit : O jaune monté d'une demi-hauteur, jamais tapé au clavier, sans ombre ni contour. À vérifier sur l'en-tête du site, l'en-tête conseiller (en négatif), le pied de page et le carnet de route.
- [ ] Jamais plus petit que 96 px de large : mesuré dans l'inspecteur, il fait 99 px.
- [ ] L'onglet du navigateur affiche le monogramme « DO » sur fond encre (favicon).

### 2. Animation du O
- [ ] Première ouverture du site dans un nouvel onglet : le O saute une fois (élan, saut, rebond, environ 1 s).
- [ ] Recharger la page ou changer de page : il ne saute plus. Nouvel onglet : il saute de nouveau.
- [ ] « Réduire les animations » activé dans le système : aucun saut.
- [ ] Écran d'accord : poser une option, puis confirmer avec la clé d'approbation (`demo-approval` en local). « Réservation confirmée par [prénom] » apparaît et le O du monogramme saute. Recharger : le monogramme reste posé, sans saut.
- [ ] Confirmer avec une mauvaise clé : un message clair, et aucun saut ensuite.

### 3. Couleurs
- [ ] Fond craie partout, texte encre. Plus aucune trace de l'ancien bleu nuit, du cyan ou de l'orange.
- [ ] Le jaune n'apparaît que sur le O (logo, monogramme, o qui saute dans un titre). Jamais en texte, en fond ou en bordure.
- [ ] Alertes et écarts de prix en brique ; informations non bloquantes en ciel pâle.
- [ ] Navigation à la touche Tab : contour de focus encre sur fond clair, jaune seulement sur les zones encre (en-tête conseiller, pied de page, en-tête du chatbot).

### 4. Typographie
- [ ] Titres, prix et totaux en Bricolage Grotesque (très gras, serrés) ; textes et interface en Instrument Sans. Aucune troisième police, y compris dans la trace de l'agent.
- [ ] Aucun titre en capitales.

### 5. Saut typographique (un seul o par écran)
- [ ] Accueil « c'est le dét**o**ur » ; formulaire « C**o**mposez votre week-end » ; merci « c'est n**o**té » ; correction « c'est c**o**rrigé ».
- [ ] Aucun autre o jaune sur ces écrans, ni dans un texte courant, un prix ou une adresse.

### 6. Photos
- [ ] Accueil : la voyageuse qui lit dans le train. Cartes : machines de Nantes, traboules de Lyon, gaufres de Lille. Plus de couchers de soleil saturés ni de photos de banque d'images.
- [ ] Les vignettes des dossiers de l'espace conseiller utilisent les mêmes photos.

### 7. Exactitude : un prix est vérifié et daté
- [ ] Proposition (conseiller) : chaque prix revérifié porte « le JJ/MM à HH:MM ». Sous le total : « Tous les prix vérifiés, le plus ancien le … » ou « Dont N prix du catalogue, pas encore vérifiés ».
- [ ] Trace de l'agent : prix revérifié daté. Accord : « Prix vérifié par l'agent le … ».
- [ ] Carnet de route (« Imprimer ») : « Prix vérifiés le … · Composé par [prénom] », puis chaque ligne datée.
- [ ] Mail de proposition : chaque ligne finit par « (prix vérifié le … à … h …) » ; un prix non daté empêche le mail.

### 8. Attention : une personne compose, signe et confirme
- [ ] Carnet de route et mails signés du prénom seul, en « je », avec « DÉTOUR · Prenez le pas de côté. »
- [ ] Le saut du O ne part que du clic du conseiller, jamais d'une action de l'agent.

### 9. Ton de voix
- [ ] Le bouton principal dit « Composer mon week-end » partout (en-tête, accueil, chatbot). Plus de « Décrire » ni de « Partez autrement ».
- [ ] Aucun astérisque sur un prix, aucun « à partir de ».
- [ ] Messages d'erreur : avec `SIMULATEUR_PANNE=erreur_serveur`, poser une option. Le message est une phrase claire (« Le prestataire n'a pas pu… »), jamais « Erreur du simulateur » ni un texte technique.
- [ ] Mails (rendez-vous, correction, proposition, confirmation) : une pointe d'humour au plus, jamais sur un prix.

### 10. Écrans du périmètre, sur ordinateur et sur téléphone
- [ ] Site : accueil, formulaire, merci, correction, connexion, chatbot.
- [ ] Conseiller : accueil, liste, dossier, proposition, trace de l'agent, accord et confirmation, carnet de route.
- [ ] Sur téléphone, rien ne déborde ; le tableau du carnet défile horizontalement.

### 11. Hors code
- [ ] Supports de pitch et présentation client refaits avec le kit (couleurs, polices, logo SVG).
- [ ] Réponse au client sur les écarts préparée, à partir de `docs/specs/design.md`, section « Écarts ».

### Tests automatiques
- [ ] `npm test` vert : 6 couleurs à la valeur du brief, contrastes, jaune rare (écrans et CSS), aucune couleur en dur, un saut au plus par page, mails datés et en « je ».
