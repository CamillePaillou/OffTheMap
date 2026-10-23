# Rétrospective finale du sprint (E10.5, #138)

- **Date :** vendredi 23/10/2026, avant le rendu de 17 h
- **Participants :** Callista Loré (PO, Scrum Master du jour), Camille Paillou, Océane Gohier-Tallon. Absents : Tabitha, Ainouche Mustapha Islam.

> Rédigée à partir des dailies, des rétrospectives de fin de journée, du PERT et de l'historique Git. ✍️ = à valider ensemble avant de fusionner.

## Chiffres

- **Sprint Goal atteint :** oui. Le cas de Nantes va de la demande à la réservation confirmée :
  - rejoué automatiquement à chaque CI (`supabase/scripts/test_bout_en_bout.sql`) ;
  - démontré en mode réel au client le 22/10, qui l'a validé (`docs/rituels/review.md`).
- **Issues terminées sur prévues :**
  - **Must :** 48 sur 48 ;
  - **Should :** 10 sur 10 ;
  - **Could :** 2 sur 2.
  - En plus du backlog initial : chatbot du site (E1.3, E1.4), ajustement d'une version (E6.6), rebranding DÉTOUR 2026 (CR-01), espace client avec suivi par numéro de dossier. Rien n'a été sorti ni repoussé. Les dernières issues restent « en cours » sur le tableau le temps des dernières corrections.
- **Fin réelle contre fin estimée :** 4 jours contre 6,6 jours. Le PERT plaçait la fin de la Sprint Review à J+6,6 ; elle a eu lieu le jeudi 22/10 (4e jour). Le vendredi a servi aux corrections et aux livrables.
- **Facteur IA réel (hypothèse 0,7) :** environ 0,4, et sans doute moins. Calcul et limites dans `docs/livrables/E12.3-dossier-livraison.md`, section 3.3. Les heures réelles n'ont pas été relevées, et du travail a été fait le soir.
- **Temps réel pour préparer une proposition (objectif 2 h) :** **non mesuré.** C'est la principale réserve du sprint.

## À garder

- **Le PERT tiré des dépendances des issues.** Chacun savait quoi prendre sans attendre l'autre, et le chemin critique a tenu malgré les absences.
- **Reprendre une tâche qui bloque.** Quand une issue bloquait le chemin, celles et ceux qui avaient de l'avance l'ont reprise, souvent Camille ou Callista : E7.3, E7.5, E9.6, E11.2.
- **Le Scrum Master du jour et le daily écrit.** Les obstacles étaient nommés le matin et levés dans la journée.
- **Le rejeu de bout en bout en CI.** Il a révélé des écarts entre les briques (étape « entretien fait » manquante, accords gardés en mémoire) avant la démonstration.
- **Une campagne d'évaluation figée avant le premier essai.** Une trace par essai, et une vérificatrice humaine qui relit le verdict proposé par le programme. Trois défauts de conception ont été corrigés à partir de preuves : résumé de l'agent, dates du brouillon, revérification après un prix changé.
- **La décision humaine face à l'IA.** Quand le modèle est tombé en panne, le conseiller a pris le relais, sans modèle payant (E9.7).
- **Les règles de la charte testées automatiquement** (`lib/design.test.ts`), en plus du test manuel.
- **Répondre vite au client :** CR-01 a été appliqué et testé dans la journée, avec des écarts expliqués plutôt que cachés.

## À arrêter

- **Ouvrir une PR sans repartir de `dev` à jour.** Trois fusions ont cassé quelque chose :
  - l'accueil du conseiller (#197) ;
  - l'écran d'accord (#204) ;
  - une branche entière abandonnée, `fix/accord-base`, remplacée par #224.
- **Dépendre d'un seul modèle gratuit sans solution de rechange testée.** Le quota épuisé, puis le retrait de MiniMax, nous ont surpris le jour de la campagne.
- **Écrire les livrables le dernier jour.** Les dossiers ont dû être rattrapés le vendredi, et des documents se contredisaient (modèle principal, délai d'appel).
- **Ne pas relever les heures.** Sans elles, le facteur IA reste une estimation.
- **Laisser des preuves implicites.** Exemples : les cases de recette non cochées, un jour sans daily (mercredi 21/10).

✍️ Votez ou ajustez ces points en équipe.

## Un échec observé et ce qu'on a changé

- **Échec :** le 22/10 au soir, la version gratuite de MiniMax est retirée par OpenRouter. L'agent ne peut plus vérifier un prix (« non vérifié ») et, comme un accord exigeait un prix vérifié par l'agent, **une panne de l'IA bloquait le dossier du client**.
- **Décision humaine :** quand l'agent ne peut pas vérifier, le conseiller vérifie lui-même auprès du prestataire et saisit le prix, sous sa responsabilité. Pas de modèle payant pour contourner la panne.
- **Choix de conception révisé :** l'accord se fonde sur le prix le plus récent, de l'agent ou du conseiller, avec sa source affichée. Au moment de réserver, le prestataire revérifie : un prix différent fait refuser la réservation. En plus, un mode rejeu annoncé permet de démontrer l'agent sans OpenRouter (E11.3).
- **Preuves :** `docs/livrables/E9.7-note-echec.md`, `src/application/accordTarifSaisi.test.ts`, `docs/agent/contrat-agent.md` (« Mode rejeu annoncé »).

## Une action pour la suite

- **Action :** mesurer le temps réel de préparation d'une proposition avec un conseiller, sur trois dossiers, et le comparer aux 6 h d'avant. En même temps, relever les heures de chacun, pour recalibrer les estimations et le facteur IA du prochain sprint.
- **Responsable :** Callista Loré (PO)
- **Échéance :** ✍️ premier jour du prochain sprint, ou à la reprise par l'agence.
