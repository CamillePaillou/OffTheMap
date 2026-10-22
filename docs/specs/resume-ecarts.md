# Résumé des écarts en mots (E6.3)

**Règle** : sur une version qui répond à un changement du client, l'IA écrit un court paragraphe qui explique au client ce qui change, **sans aucun chiffre ni montant**. Le conseiller le reprend dans sa réponse et y ajoute les prix lui-même. Cas d'usage : `src/application/resumeEcarts.ts`. Écran : bas de la carte « Ce qui a changé depuis la version N » (E6.2), bouton « Rédiger le résumé pour le client ».

## Parcours

1. Le code calcule les écarts avec la version précédente (E6.2, `comparerVersions`).
2. Il les traduit en **faits qualitatifs** (`src/domain/proposition/entreeEcarts.ts`) : pour chaque prestation, `ajoutee`, `retiree` ou `modifiee`, jours ou nuits en plus, en moins ou déplacés, participants en plus ou en moins, coût en hausse, en baisse ou identique ; puis le sens du total et `prix_a_confirmer`. **Aucun chiffre ne part vers le modèle** : ni montant, ni date, ni nombre (testé).
3. Le modèle rend `{ resume }` par l'outil `rendre_resume_ecarts`, validé par `EcartsIA` (`types/ia.ts`) : un chiffre, « € », « euro(s) » ou « EUR » rend la réponse non conforme (« heure » ou « Europe » passent).
4. Une réponse non conforme ou un échec du fournisseur : un seul nouvel essai, puis un message au conseiller ; rien n'est écrit.
5. Le résumé est écrit dans `propositions.ecarts` avec l'**empreinte** des faits pour lesquels il a été rédigé.

## Résumé périmé

Les écarts sont recalculés à chaque lecture (E6.2) : ils changent quand un tarif est confirmé ou une ligne remplacée. L'écran recalcule l'empreinte ; si elle diffère de celle enregistrée, il affiche « Les écarts ont changé depuis ce résumé : rédigez-le à nouveau ». Le conseiller peut toujours le rédiger à nouveau.

## Contrats

- `LlmClient` (`src/ports/llm-client.ts`) gagne `resumerEcarts(entree: EntreeEcarts): Promise<EcartsIA>` (faux client et OpenRouter).
- `EcartsIA` refuse aussi les montants écrits en lettres.
- `Proposition.ecarts` (`types/dashboard.ts`) : `{ resume, empreinte }`, `null` tant qu'aucun résumé n'a été rédigé.
- Port `ResumeEcartsEcriture` ; écriture par le serveur seulement (clé service_role). Aucune migration : la colonne `propositions.ecarts` existait déjà.

## Tests

`src/application/resumeEcarts.test.ts` : l'exemple connu d'E6.2 traduit en faits ; aucun chiffre envoyé au modèle ; **le texte ne contient aucun montant** (refus de « 550 € », « 182 », « cent quatre-vingt-deux euros », « EUR », d'une date ; acceptation de « heure », « Europe ») ; nouvel essai puis échec sans écriture ; modèle non configuré ; version 1, versions identiques et proposition inconnue sans appel au modèle ; empreinte stable.
