# Note de transfert

**Pour qui :** l'équipe qui reprend le service DÉTOUR (agence ou autre équipe de développement). **Rédigée le 23/10/2026** par Callista Loré (PO), avec l'équipe.

---

## 1. Ce que vous recevez

| | |
| --- | --- |
| **Version** | Tag `v1.0` sur la branche `main` du dépôt `CamillePaillou/OffTheMap` (`git checkout v1.0`) ; le développement continue sur `dev` |
| **Ce que fait le service** | Un conseiller prépare une proposition de voyage sur mesure, de la demande à la réservation. Côté voyageur : formulaire avec chatbot, suivi sans compte par numéro de dossier, compte facultatif pour répondre en ligne. Parcours et périmètre : E12.3, section 1 |
| **Verdict de recette** | Accepté avec réserves (E12.3, section 2) ; démonstration validée par le client le 22/10 (`docs/rituels/review.md`) |
| **Ce qui n'existe pas** | Paiement réel, rendez-vous en ligne, envoi automatique des mails (ils partent de la messagerie du conseiller), vrais prestataires (remplacés par le simulateur du formateur) |

## 2. Lancer et vérifier en 10 minutes

Prérequis : Docker démarré (assez de mémoire pour Supabase), Node.js 24, make.

```sh
cp .env.example .env      # puis remplir LLM_API_KEY (clé OpenRouter personnelle)
make up                   # Supabase, simulateur, application
make reset                # base propre : migrations puis données de démonstration
make test-db              # tests de la base : schéma, seed, parcours complet, espace client
npm test                  # tests unitaires
```

Ce qu'on doit voir :
- `http://localhost:3000/api/health` répond `{"app":"ok","supabase":"ok"}` ;
- l'espace conseiller s'ouvre avec `conseiller@offthemap.test` / `offthemap-demo` ;
- le suivi sans compte répond pour le numéro `DT-JADE-NANT` sur `/suivi` ;
- l'espace client s'ouvre avec `jade@example.org` / `offthemap-demo` ;
- une option posée se confirme avec la clé d'approbation `demo-approval` (section 4) ;
- les mails de test arrivent sur `http://localhost:54324`.

Pièges connus : lancer `make up` **avant** `make reset` ; si Supabase reste *unhealthy*, augmenter la mémoire de Docker.

## 3. Où est quoi

| Sujet | Document de référence |
| --- | --- |
| Lancement, commandes, variables | `README.md`, `.env.example` |
| Besoin, décisions, architecture | `docs/livrables/E12.1-dossier-conception.md` |
| Règles métier (une spécification par fonction) | `docs/specs/` |
| Agent de vérification : mission, outil, contrôles, trace, mode rejeu | `docs/agent/contrat-agent.md` |
| Qui peut lire, proposer, poser, confirmer | `docs/specs/permissions.md` |
| Évaluation de l'agent : jeu de 12 cas, résultats, diagnostics | `evaluation/README.md`, `evaluation/diagnostic-v2.md`, `evaluation/note-usage.md` |
| Échec observé et décision humaine (panne du modèle) | `docs/livrables/E9.7-note-echec.md` |
| Charte DÉTOUR 2026 et écarts justifiés | `docs/specs/design.md`, `docs/pitch/` |
| Recettes | `docs/recette/bout-en-bout.md`, `docs/recette/rebranding.md` |
| Méthode : sprint, dailies, revue, rétrospectives | `docs/rituels/` |

## 4. Secrets et accès

Aucune clé n'est dans le dépôt. gitleaks et `lib/securite.test.ts` le vérifient en CI.

| Secret | Où il vit | Comment l'obtenir |
| --- | --- | --- |
| Clé OpenRouter (`LLM_API_KEY`) | `.env` de chaque poste | À créer sur OpenRouter. Les clés de l'équipe sont personnelles et **ne se transmettent pas** |
| Clé d'équipe du simulateur (`SIMULATEUR_TEAM_KEY`) | `.env` | `demo-key` en local ; fournie par le formateur pour son serveur |
| Clé d'approbation | Saisie par le conseiller au moment de confirmer, jamais stockée | `demo-approval` en local ; fournie par le formateur pour son serveur |
| Clés Supabase (`service_role`, `anon`) | `.env.supabase`, écrit par `make up` | Générées localement, rien à copier |

## 5. Ce qui est fragile

| Point fragile | Ce qui se passe | Que faire |
| --- | --- | --- |
| **Modèle gratuit d'OpenRouter** (quota quotidien, retrait sans préavis : MiniMax retiré le 22/10) | L'agent conclut « non vérifié », sans prix ; la fiche passe en erreur avec « relancer » | Le conseiller vérifie le prix lui-même et le saisit (voir E9.7). Pour une démonstration : `AGENT_MODE=rejeu` |
| **Choix du modèle** | `recursive/flint-v1.0:free` en principal, Nemotron (`nvidia/nemotron-3-ultra-550b-a55b:free`) en réserve, délai de 60 s (`.env.example`) | Flint rend mal la fiche (E12.3, section 7) : si la campagne v4 le confirme, passer Nemotron en principal |
| **Option de 72 h contre 30 min dans le simulateur** | En démonstration, l'option expire vite | Confirmer juste après la pose |
| **Option posée à un autre prix** | La réservation est refusée, mais l'option reste chez le prestataire jusqu'à son expiration | À annuler côté prestataire si le simulateur le permet |
| **Supabase en local** | Une dizaine de conteneurs, gourmands en mémoire | Voir les pièges de la section 2 |

Conséquences et suites : E12.3, section 5.

## 6. Ce qui reste ouvert

| Priorité | Sujet | Pourquoi |
| --- | --- | --- |
| 1 | Mesurer le temps de préparation d'une proposition (objectif 2 h, contre 6 h avant) | Besoin principal du client, non mesuré |
| 2 | Relancer toute la campagne d'évaluation avec le modèle retenu (`make campagne V=v4 …`) | Seuls A02 et A03 ont été retestés après le changement de modèle |
| 3 | Mettre le numéro de dossier dans les mails du conseiller | Le voyageur ne le voit que sur la page « Merci » |
| 4 | Prévenir le conseiller quand un voyageur répond en ligne | La réponse n'apparaît qu'à l'ouverture de la proposition |
| 5 | Hébergement, SMTP et modèles de mails sur un projet Supabase hébergé | Tout est configuré pour le local (`docs/specs/espace-client.md`) |
| Phase 2 | Relances automatiques, transcription de l'entretien, vrais prestataires, documents de voyage | Hors MVP (plan de réalisation, section 1) |

## 7. Décisions à ne pas défaire sans raison

- **Aucun prix ne vient de l'IA.** Le code chiffre ; le modèle ne produit aucun montant.
- **L'agent ne fait que lire.** Un seul outil, `verifier_disponibilite`. Poser, confirmer et annuler restent des gestes du conseiller.
- **L'accord est lié au prix et ne sert qu'une fois** (règles : E12.1, section 1.5).
- **La confirmation exige la clé d'approbation**, jamais stockée ni vue par le modèle.
- **Le voyageur ne change aucun statut.** Le conseiller reporte sa réponse en ligne.
- **Pas de modèle payant**, même en secours : l'application le refuse (voir E9.7).

Raisons et preuves : E12.1, section 3, et `docs/agent/contrat-agent.md`.