SUPABASE := npx supabase
DB_CONTAINER := supabase_db_off-the-map

-include .env
APP_PORT ?= 3000

.DEFAULT_GOAL := help
.PHONY: help up down restart logs status migrate seed reset test-db lint typecheck build essai-llm essai-agent essai-chatbot

help: ## Liste les commandes
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

node_modules: package-lock.json
	npm ci
	@touch node_modules

.env:
	@echo "Fichier .env absent : lancer d'abord  cp .env.example .env" && exit 1

up: .env node_modules ## Lance Supabase puis l'application
	$(SUPABASE) start
	@$(SUPABASE) status -o env \
		--override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
		--override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
		| grep -E '^(NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' > .env.supabase
	docker compose up -d --build --renew-anon-volumes
	@echo "Application : http://localhost:$(APP_PORT)"
	@echo "Studio Supabase : http://localhost:54323  ·  Mails de test : http://localhost:54324"

down: ## Arrête l'application et Supabase (les données sont conservées)
	docker compose down
	$(SUPABASE) stop

restart: down up ## Relance tout

logs: ## Suit les logs de l'application
	docker compose logs -f app

status: ## Affiche les URL et l'état de Supabase
	$(SUPABASE) status

migrate: ## Applique les migrations en attente
	$(SUPABASE) migration up

seed: ## Charge les données de démonstration (supabase/seed.sql)
	docker exec -i $(DB_CONTAINER) psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql

reset: ## Recrée la base : migrations puis seed (efface les données locales)
	$(SUPABASE) db reset

test-db: ## Vérifie le schéma, les données de démonstration et rejoue le cas de Sophie (transactions annulées)
	docker exec -i $(DB_CONTAINER) psql -q -U postgres -d postgres < supabase/scripts/test_contraintes.sql
	docker exec -i $(DB_CONTAINER) psql -q -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/test_seed.sql
	docker exec -i $(DB_CONTAINER) psql -q -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/scripts/test_bout_en_bout.sql

essai-llm: .env node_modules ## Appel réel à OpenRouter avec les modèles de .env (E0.19)
	LLM_ESSAI_REEL=1 node --env-file=.env node_modules/vitest/vitest.mjs run src/infrastructure/llm/openrouter.essai-reel.test.ts

essai-agent: .env node_modules ## Agent réel : OpenRouter + simulateur local (E8.3) ; PANNE=delai ou erreur_serveur
	LLM_ESSAI_REEL=1 SIMULATEUR_URL=http://localhost:$(or $(SIMULATEUR_PORT),8765) SIMULATEUR_PANNE=$(or $(PANNE),aucune) node --env-file=.env node_modules/vitest/vitest.mjs run src/application/verifierPrestation.essai-reel.test.ts

essai-chatbot: .env node_modules ## Chatbot réel : OpenRouter + simulateur local (E1.3) ; PANNE=delai ou erreur_serveur
	LLM_ESSAI_REEL=1 SIMULATEUR_URL=http://localhost:$(or $(SIMULATEUR_PORT),8765) SIMULATEUR_PANNE=$(or $(PANNE),aucune) node --env-file=.env node_modules/vitest/vitest.mjs run src/application/repondreChatbot.essai-reel.test.ts

lint: node_modules ## Lint
	npm run lint

typecheck: node_modules ## Vérifie les types
	npm run typecheck

build: node_modules ## Build de production
	npm run build
