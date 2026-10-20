# Écarts entre deux versions d'une proposition (E6.2)

**Règle** : sur une version qui répond à un changement du client (v2, v3…), le conseiller voit ce qui a changé depuis la version précédente, prestation par prestation, avec l'écart en euros. Tout est calculé par le code. Règle : `src/domain/proposition/ecartsVersions.ts`. Écran : carte « Ce qui a changé depuis la version N » sur la page de la proposition (`/conseiller/propositions/[id]`).

```gherkin
Scénario : écarts d'un exemple connu
  Étant donné une version 1 envoyée à 368 € et une version 2 avec une nuit d'hôtel en plus
  Quand le conseiller ouvre la version 2
  Alors il voit l'hôtel passer de 1 à 2 nuits (+192 €), l'atelier de 40 € à 35 € (−10 €) et le total de 368 € à 550 € (+182 €)
```

## Calcul

- On compare la version affichée à la **version précédente du même dossier** (numéro − 1).
- La comparaison se fait **par prestation** : une nuit d'hôtel ajoutée se lit « 1 → 2 nuits », pas « une ligne retirée, deux ajoutées ». Une date déplacée est un changement de dates.
- Seules les **lignes retenues** comptent (ni `remplacee` ni `indisponible`), comme dans le total (`REGLES_CHIFFRAGE.statutsHorsTotal`).
- Prix d'une ligne : son **prix effectif**, confirmé sinon catalogue. Total d'une prestation : somme de ses `total_ligne_cents`.
- Pour chaque prestation : `ajoutee`, `retiree` ou `modifiee` (changements : `dates`, `participants`, `prix`), et `delta_cents` (positif : plus cher). Les prestations identiques sont seulement comptées (`inchangees`).
- Écart du total = total des lignes retenues de la version − celui de la précédente = somme des écarts par prestation.
- `prix_a_verifier` : la version a encore des prix catalogue ; l'écran prévient que les écarts évolueront avec les tarifs confirmés.

Les écarts sont **recalculés à chaque lecture**, jamais enregistrés : la version suivante change tant que ses prix ne sont pas confirmés. La colonne `propositions.ecarts` (`{ resume }`) reste réservée au résumé en mots écrit par l'IA, sans chiffres (E6.3).

## Exemple connu, calculé à la main

Version 1, envoyée, prix confirmés ; version 2 créée par E6.1 (« deux nuits au lieu d'une »), prix catalogue à vérifier. 2 participants.

| Prestation | v1 | v2 | Écart |
| --- | --- | --- | --- |
| Train vers Nantes | 7 nov. · 48 € × 2 = 96 € | 7 nov. · 48 € × 2 = 96 € | inchangé |
| Hôtel des Machines | 7 nov. · 96 € × 2 = 192 € | 7 et 8 nov. · 96 € × 2 × 2 nuits = 384 € | dates, **+192 €** |
| Atelier de machines imaginaires | 7 nov. · 40 € (confirmé) × 2 = 80 € | 7 nov. · 35 € (catalogue) × 2 = 70 € | prix, **−10 €** |
| **Total** | **368 €** | **550 €** | **+182 €** |

Vérification : 192 − 10 = 182 = 550 − 368. Ce cas est rejoué tel quel par `src/domain/proposition/ecartsVersions.test.ts`.

## Ce que voit le conseiller

Carte « Ce qui a changé depuis la version 1 », sous le motif du changement : total avant → après avec l'écart, puis un tableau Prestation | Version 1 | Version 2 | Écart. Chaque côté montre les dates (et le nombre de nuits pour un hébergement), les participants et le prix unitaire, avec « (à vérifier) » pour un prix catalogue. Rien n'est affiché sur une version 1.

## Contrats

Aucun changement des payloads du dashboard (`types/dashboard.ts`). Le port `PropositionsLecture` gagne `versionDuDossier(dossierId, version)` pour lire la version précédente, au nom du conseiller (RLS).

## Tests

`src/domain/proposition/ecartsVersions.test.ts` : l'exemple connu au centime près, somme des écarts = écart du total, prestation ajoutée, retirée, participants changés, lignes remplacées ou indisponibles ignorées, versions identiques, date déplacée.
