# OffTheMap

Next.js (TypeScript) avec deux espaces : `/demande` (page publique) et `/conseiller` (back-office). Supabase tourne en local via la CLI Supabase ; l'application tourne dans Docker Compose.

## Prérequis

- Docker Desktop (ou Docker Engine avec Compose v2), démarré
- Node.js 24 et npm
- make

## Démarrer

```sh
git clone <url-du-depot> && cd OffTheMap
cp .env.example .env
make up
```

- Application : http://localhost:3000 (port modifiable avec `APP_PORT` dans `.env`)
- Santé : http://localhost:3000/api/health doit répondre `{"app":"ok","supabase":"ok"}`
- Studio Supabase : http://localhost:54323
- Mails de test : http://localhost:54324

Le premier `make up` télécharge les images Supabase : compter quelques minutes. Les clés locales de Supabase sont écrites dans `.env.supabase` (non versionné) ; il n'y a rien à copier à la main.

## Commandes

| Commande | Effet |
| --- | --- |
| `make up` | Lance Supabase puis l'application |
| `make down` | Arrête tout (les données sont conservées) |
| `make logs` | Suit les logs de l'application |
| `make status` | URL et état de Supabase |
| `make migrate` | Applique les migrations en attente (`supabase/migrations/`) |
| `make seed` | Charge les données de démonstration (`supabase/seed.sql`) |
| `make reset` | Recrée la base : migrations puis seed (efface les données locales) |
| `make lint` · `make typecheck` · `make build` | Contrôles lancés aussi par la CI |

Une nouvelle migration se crée avec `npx supabase migration new <nom>`.

## Données de démonstration

`make seed` (et `make reset`) charge `supabase/seed.sql` : le compte du conseiller (`conseiller@offthemap.test`, mot de passe `offthemap-demo`, base locale uniquement), les 9 prestations du simulateur du formateur et 13 dossiers fictifs à Nantes, un par étape clé, du dossier tout juste reçu jusqu'à la réservation confirmée. Le seed est rejouable : il remplace les dossiers de démonstration sans créer de doublon. `make test-db` le vérifie.

## Types et contrats

| Où | Quoi |
| --- | --- |
| `supabase/migrations/20261019120000_schema_initial.sql` | Schéma du MVP : 10 tables, énumérations (valeurs hors MVP comprises), contraintes, RLS en lecture pour les conseillers |
| `types/database.ts` | Types des tables, **générés** : `npx supabase gen types typescript --local > types/database.ts` (jamais écrits à la main) |
| `types/enums.ts` | Énumérations et limites partagées ; identiques à la migration (vérifié par les tests) |
| `types/ia.ts` | Schémas Zod des réponses du LLM (fiche, brouillon, conclusion de l'agent) et outil `verifier_disponibilite` |
| `types/llm.ts` | `DemandePourLLM` : seule forme de demande acceptée par le LLM (minimisation) |
| `types/simulateur.ts` | Réponses du simulateur du formateur, lues par l'adaptateur seulement |
| `types/historique.ts` | Détail de chaque type d'événement du journal |
| `supabase/migrations/20261019130000_fonction_transition.sql` | Fonction SQL `changer_statut` : statut et historique écrits dans la même transaction, réservée au serveur |
| `src/application/changerStatut.ts` | Fonction de transition (E0.7) : seul point d'écriture d'un statut ; refuse ce que la matrice `types/transitions.ts` n'autorise pas (voir `docs/specs/transitions.md`) |
| `src/domain/chiffrage/chiffrer.ts` | Chiffrage d'une proposition (E4.2) : totaux en centimes, alertes de `propositions.alertes`, envoi bloqué ou non. Un tarif absent lève une erreur, jamais 0 (`docs/specs/chiffrage.md`) |
| `src/application/verifierPrestation.ts` | Boucle de l'agent de vérification (E8.3) : un seul outil en lecture, 3 tours, prix et places repris du simulateur, trace expurgée (`docs/agent/contrat-agent.md`). Essai réel : `make essai-agent` |
| `types/dashboard.ts` · `fixtures/dashboard/` | Payloads du back-office (liste, détail, proposition) et fixtures validées, pour afficher les écrans sans la base (`docs/specs/dashboard.md`) |

`npm test` lance les tests des types (Vitest). Les règles portées par la base se vérifient sur la base locale :

```sh
docker exec -i supabase_db_off-the-map psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/test_contraintes.sql
```

Le script travaille dans une transaction annulée à la fin : il ne laisse aucune donnée. Il se termine par « TOUS LES TESTS SONT PASSÉS ».

## Connexion du conseiller

`/conseiller` exige une connexion (Supabase Auth, e-mail et mot de passe) : sans session, le proxy (`proxy.ts`) renvoie vers `/connexion`. Chaque page du back-office appelle `exigerConseiller()` (`lib/auth/conseiller.ts`), qui vérifie la session et le profil du conseiller.

Compte de démonstration créé par le seed (base locale uniquement) : `conseiller@offthemap.test` / `offthemap-demo`.

## Simulateur du formateur

Les prestations (catalogue, disponibilités, options, réservations) viennent du simulateur du formateur (dépôt `PANDORMedia/gestion-projet-agentique-web3`, `server/app.py`), appelé uniquement par le serveur à travers `src/infrastructure/prestataires/simulateur.ts` (port `src/ports/prestataires.ts`).

- `make up` le construit depuis GitHub et le lance en mode démonstration : API sur http://localhost:8765, tableau de bord en lecture seule sur http://localhost:8765/dashboard. Aucun clone à faire.
- Clés de démonstration : équipe `demo-key`, approbation `demo-approval` (la clé d'approbation est saisie par le conseiller, jamais envoyée par l'agent). La clé d'équipe se règle dans `.env` : `SIMULATEUR_TEAM_KEY`.
- Pour viser le serveur du formateur plutôt que le simulateur local, changer `SIMULATEUR_URL` et `SIMULATEUR_TEAM_KEY` dans `.env`.
- Pannes que le simulateur ne produit pas : `SIMULATEUR_PANNE=delai` ou `erreur_serveur` dans `.env` (puis relancer l'application) ; l'adaptateur rend alors une erreur explicite et aucun prix. `aucune` rétablit le fonctionnement normal.

## Variables d'environnement

`.env.example` liste toutes les variables, sans valeur sensible. Toute nouvelle variable y est ajoutée dans la même PR.
