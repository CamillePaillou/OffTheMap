# Rejouer le cas de Sophie de bout en bout (E7.3)

**But** : faire passer un dossier complet par toutes les briques, du formulaire au dépôt de garantie, pour révéler les écarts entre elles. Critère de l'issue : le scénario se déroule **du formulaire au dépôt sans intervention technique**.

**Rejeu automatique** : [`supabase/scripts/test_bout_en_bout.sql`](../../supabase/scripts/test_bout_en_bout.sql), lancé par `make test-db` et par la CI (étape « Rejeu du cas de Sophie »). Chaque étape appelle la fonction SQL que l'application appelle à ce moment-là, avec les données de l'écran, et vérifie le statut obtenu. Tout se passe dans une transaction annulée.

Les étapes faites par le code de l'application (fiche de l'IA, brouillon, chiffrage, agent) sont remplacées par leur résultat, tel que le code l'écrit en base : le rejeu contrôle que les briques s'enchaînent, les tests unitaires contrôlent chaque brique.

## Le scénario

Sophie Martin, deux adultes, Nantes, du samedi 7 au dimanche 8 novembre 2026 (une nuit), budget 400 €, « un week-end créatif, sans voiture, avec un atelier », végétarienne.

```gherkin
Fonctionnalité: Le cas de Sophie, du formulaire au dépôt reçu

  Scénario: Parcours complet sans intervention technique
    Étant donné le catalogue de Nantes (train 48 €, hôtel 96 €, atelier 35 €)
    Quand Sophie envoie sa demande depuis le formulaire public
    Alors un dossier est créé et sa fiche est préparée automatiquement
    Quand la conseillère valide la demande
    Et envoie le mail de rendez-vous
    Et confirme que l'entretien a eu lieu
    Et note le budget réel (400 €) et les dates fixes
    Et génère le brouillon
    Alors une proposition à 358 € attend la vérification de ses 3 prix
    Quand l'agent revérifie chaque prix (l'atelier est passé à 40 €)
    Et que la conseillère accepte les prix revérifiés
    Alors la proposition est prête, à 368 €, soit 92 % du budget
    Quand elle l'envoie et envoie le mail de la proposition
    Et que Sophie accepte, puis verse le dépôt de garantie
    Alors la proposition est au statut « dépôt reçu »
    Et chaque changement de statut et chaque mail est inscrit dans l'historique du dossier
```

| # | À l'écran | Brique | Fonction SQL | Statut attendu |
| --- | --- | --- | --- | --- |
| 1 | Formulaire public, « Envoyer ma demande » | E1.1 | `deposer_demande` | dossier `nouvelle` |
| 2 | (automatique, après l'envoi) | E2.2 | `changer_statut`, `terminer_generation_fiche` | `fiche_en_cours` puis `fiche_prete` |
| 3 | Fiche, « Valider » | E3.1 | `trier_dossier` | `validee` |
| 4 | Mail « Rendez-vous », « Marquer comme envoyé » | E5.4 | `marquer_mail_envoye` | `rdv_propose` |
| 5 | **« Entretien fait »** (ajouté par E7.3), puis « Après l'entretien » | E7.3, E2.1 | `changer_statut`, `corriger_fiche` | `entretien_fait`, budget réel 400 € |
| 6 | « Générer le brouillon » | E4.4 | `demarrer_brouillon` | dossier `en_proposition`, fiche validée |
| 7 | (automatique) | E4.4, E4.2 | `terminer_brouillon` | proposition `a_verifier`, 3 lignes, 358 € |
| 8 | Ligne, « Vérifier le prix » | E8.3, E8.4 | écriture dans `verifications` | 3 vérifications `ok` |
| 9 | Ligne, « Accepter (agent) » | E5.1 | `changer_ligne`, `enregistrer_alertes` | `prete`, total 368 € |
| 10 | « Envoyer au client », mail « Proposition » | E5.1, E5.4 | `envoyer_proposition`, `marquer_mail_envoye` | `envoyee`, au nom de la conseillère |
| 11 | « Le client accepte », « Dépôt reçu » | E7.1 | `enregistrer_reponse_client` | `acceptee` puis `depot_recu` |

Contrôles de fin : aucune ligne à vérifier ; historique du dossier `nouvelle > fiche_en_cours > fiche_prete > validee > rdv_propose > entretien_fait > en_proposition` ; historique de la proposition `brouillon_en_cours > brouillon_pret > a_verifier > prete > envoyee > acceptee > depot_recu` ; deux mails tracés.

## Écarts révélés par le rejeu

| Écart | Effet | Correction |
| --- | --- | --- |
| Aucun écran ne faisait passer le dossier de `rdv_propose` à `entretien_fait` | Le brouillon (E4.4) n'était accessible qu'en modifiant la base à la main : le scénario s'arrêtait à l'étape 5 | Bouton **« Entretien fait »** dans le bloc « Maintenant » de la fiche (action `entretienFait`, par la fonction de transition) |
| La fusion du design avec E6.4 avait cassé `app/conseiller/page.tsx` (balises non fermées, ancien tableau mêlé au nouveau) | `dev` ne compilait plus : l'espace conseiller ne s'ouvrait pas | Corrigé par #197 : accueil reconstruit, rappels « Clients à relancer » (E6.4) dans le style du back-office |
| Une proposition `sans_reponse` affichait « Client · Attendre la réponse » | Le conseiller ne voyait pas qu'il devait relancer | Prochaine étape « À vous · Relancer le client » |

## Hors du périmètre d'E7.3

- **Option et réservation** (après le dépôt) : l'écran d'accord (E9.3) et la pose d'option (E9.4) travaillent encore sur les fixtures ; la seconde validation (E9.5) est hors sprint. À intégrer dans E7.4 (correctifs d'intégration), avant la Sprint Review (E7.6), si l'équipe veut montrer la réservation.
- **Mode réel** : le rejeu ne contacte ni le modèle ni le simulateur. Les essais réels restent `make essai-llm` et `make essai-agent`.
