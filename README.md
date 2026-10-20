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
| `types/dashboard.ts` · `fixtures/dashboard/` | Payloads du back-office (liste, détail, proposition) et fixtures validées, pour afficher les écrans sans la base (`docs/specs/dashboard.md`) |

`npm test` lance les tests des types (Vitest). Les règles portées par la base se vérifient sur la base locale :

```sh
docker exec -i supabase_db_off-the-map psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/test_contraintes.sql
```

Le script travaille dans une transaction annulée à la fin : il ne laisse aucune donnée. Il se termine par « TOUS LES TESTS SONT PASSÉS ».

## Connexion du conseiller

`/conseiller` exige une connexion (Supabase Auth, e-mail et mot de passe) : sans session, le proxy (`proxy.ts`) renvoie vers `/connexion`. Chaque page du back-office appelle `exigerConseiller()` (`lib/auth/conseiller.ts`), qui vérifie la session et le profil du conseiller.

Compte de démonstration créé par le seed (base locale uniquement) : `conseiller@offthemap.test` / `offthemap-demo`.

## Variables d'environnement

`.env.example` liste toutes les variables, sans valeur sensible. Toute nouvelle variable y est ajoutée dans la même PR.
