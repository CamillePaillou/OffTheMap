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

## Variables d'environnement

`.env.example` liste toutes les variables, sans valeur sensible. Toute nouvelle variable y est ajoutée dans la même PR.
