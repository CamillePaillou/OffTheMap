# Évaluation de l'agent (E11)

Jeu de cas **figé le 20 octobre 2026, avant le premier essai** : `jeu-v1.json`. Il adapte le jeu de départ du cours (J4) à notre produit : l'agent de vérification, la fiche et le brouillon, et le parcours accord, option, confirmation.

| Famille | Cas | Mode | Essais |
| --- | --- | --- | --- |
| Nominal | N01 vérification d'une ligne · N02 refus du conseiller · N03 accord, option, seconde validation | agent direct · intégration HTTP · intégration HTTP | 3 · 1 · 1 |
| Ambigu | A01 budget vague · A02 dates contradictoires · A03 voyageurs incertains | agent direct | 1 chacun |
| Erreur | E01 places insuffisantes · E02 prix modifié avant l'option · E03 simulateur en délai dépassé | agent direct · intégration HTTP · rejeu | 1 chacun |
| Adversarial | X01 description qui commande · X02 outil absent · X03 arguments détournés | agent direct · unitaire · unitaire | 3 · 1 · 1 |

Chaque cas porte son état initial, sa fixture, ses critères de réussite et d'échec, l'oracle à conserver et ses limites. Deux cas critiques (N01, X01) sont répétés trois fois, comme le permet le cours.

## Écarts avec le jeu du cours

- A02 et A03 : notre formulaire exige des dates et un nombre de voyageurs ; la date relative et les participants absents deviennent une contradiction et une incertitude dans le texte libre.
- E03 : délai dépassé du simulateur (critère 1 du contrat de l'agent) à la place de la limitation 429, qui relève de l'adaptateur OpenRouter (E0.19).
- X01 couvre aussi la demande de clé (X03 du cours) ; X03 devient « arguments détournés » (critère 3 du contrat).
- Le critère 4 du contrat (fait annoncé différent du JSON) est vérifié dans chaque cas en agent direct et par les tests d'E8.5.

## Campagne (E11.2)

1. Ne plus modifier `jeu-v1.json`. Un changement crée `jeu-v2.json` et une nouvelle campagne.
2. Écrire une ligne JSONL par essai dans `resultats-v1.jsonl` : `campagne`, `version_programme`, `jeu_version`, `cas_id`, `essai`, `mode`, `verdict` (`reussite`, `echec`, `non_execute`), `violation_executee`, `tentative_bloquee`, `preuve`, `verificateur`. Un essai non exécuté reste dans le fichier avec sa raison.
3. Compter avec l'outil du cours : `python3 synthese.py evaluation/jeu-v1.json evaluation/resultats-v1.jsonl` (dossier `content/j4` du dépôt du formateur).
4. Diagnostiquer un défaut, corriger, puis écrire `resultats-v2.jsonl` avec le même manifeste.

Aucune clé dans les fichiers de résultats ni dans les traces conservées.
