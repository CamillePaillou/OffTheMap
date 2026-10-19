-- Off the Map : schéma initial du MVP (E0.4, E0.16, E0.5)
-- Supabase local. Montants en centimes (entiers). Dates de voyage en `date`, instants en `timestamptz` (UTC).
-- Les énumérations contiennent déjà les valeurs hors MVP : en ajouter est facile, en retirer ne l'est pas.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ énumérations
create type statut_dossier as enum (
  'nouvelle', 'fiche_en_cours', 'fiche_prete', 'erreur', 'go', 'a_corriger', 'refusee',
  'rdv_propose', 'entretien_fait', 'en_proposition', 'gagnee', 'abandonnee'
);
create type decision_tri as enum ('go', 'a_corriger', 'refusee');
create type statut_proposition as enum (
  'brouillon_en_cours', 'brouillon_pret', 'a_verifier', 'prete', 'envoyee', 'sans_reponse',
  'changement_demande', 'remplacee', 'acceptee', 'depot_recu', 'reservee', 'erreur'
);
create type statut_ligne as enum ('a_verifier', 'confirme', 'indisponible', 'remplacee', 'reservee');
create type source_prix as enum ('agent', 'telephone', 'mail', 'lien');
create type type_prestation as enum ('transport', 'hebergement', 'activite');
create type statut_verification as enum ('ok', 'echec', 'indisponible');
create type arret_agent as enum ('conclusion', 'tours_max', 'echec_serveur', 'reponse_invalide');
create type statut_option as enum ('accord_donne', 'posee', 'expiree', 'echec', 'confirmee', 'annulee');
create type type_evenement as enum ('statut', 'mail', 'rappel', 'depot', 'changement', 'verification', 'accord', 'option', 'reservation');
create type auteur_evenement as enum ('conseiller', 'systeme');
create type niveau_physique as enum ('faible', 'modere', 'soutenu', 'intense');
create type tranche_age as enum ('0_2', '3_11', '12_17', 'adulte');
create type regime as enum ('vegetarien', 'vegetalien', 'sans_gluten', 'allergie', 'autre');
create type mobilite as enum ('aucune', 'reduite');

-- ------------------------------------------------------------------ conseillers
-- Un profil par compte Supabase Auth. Le nom affiché est envoyé au simulateur comme `approuve_par` (80 caractères max).
create table profils (
  id uuid primary key references auth.users (id) on delete cascade,
  nom_affiche text not null check (char_length(btrim(nom_affiche)) between 1 and 80),
  cree_le timestamptz not null default now()
);

-- ------------------------------------------------------------------ dossier client
-- Le dossier porte le statut du parcours ; les versions de la demande s'y rattachent.
create table dossiers (
  id uuid primary key default gen_random_uuid(),
  statut statut_dossier not null default 'nouvelle',
  cree_le timestamptz not null default now()
);

-- Le brut du formulaire, une ligne par version. Personne ne la modifie.
create table demandes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers (id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  remplacee_le timestamptz,                         -- renseigné quand une version suivante existe (Should E1.2)
  consentement_rgpd boolean not null check (consentement_rgpd),
  consentement_ia boolean not null check (consentement_ia),
  consenti_le timestamptz not null default now(),
  -- données personnelles : jamais envoyées au LLM
  nom text not null check (char_length(btrim(nom)) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  tel text,
  -- projet de voyage
  destination text,                                 -- null = « aucune idée »
  date_debut date not null,
  date_fin date not null,
  dates_flexibles boolean not null default false,
  nb_nuits integer not null check (nb_nuits between 0 and 14),   -- demandé explicitement au client
  voyageurs tranche_age[] not null check (cardinality(voyageurs) between 1 and 20),
  budget_annonce_cents integer check (budget_annonce_cents > 0),
  budget_ferme boolean not null default false,
  envies text,
  contraintes text,
  niveau_physique niveau_physique,
  -- sensible : seules les catégories partent vers le LLM, jamais les précisions
  regimes regime[] not null default '{}',
  regime_precision text,
  mobilite mobilite,
  sante_precision text,
  cree_le timestamptz not null default now(),
  unique (dossier_id, version),
  check (date_fin >= date_debut),
  check (nb_nuits <= date_fin - date_debut)
);

-- L'interprétation d'une version : IA, puis correction du conseiller. Une fiche par version.
create table fiches (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null unique references demandes (id) on delete cascade,
  envies text[] not null default '{}',
  contraintes text[] not null default '{}',
  points_flous text[] not null default '{}',
  regimes regime[] not null default '{}',
  mobilite mobilite,
  niveau_physique niveau_physique,
  -- après l'entretien (étape 5)
  budget_reel_cents integer check (budget_reel_cents > 0),
  date_debut_fixe date,
  date_fin_fixe date,
  nb_nuits_fixe integer check (nb_nuits_fixe between 0 and 14),
  decision decision_tri,
  validee_par uuid references profils (id),
  validee_le timestamptz,
  notes_conseiller text,
  modele text,
  erreur_generation text,
  cree_le timestamptz not null default now(),
  check (date_fin_fixe is null or date_debut_fixe is null or date_fin_fixe >= date_debut_fixe),
  check ((validee_par is null) = (validee_le is null))
);

-- ------------------------------------------------------------------ catalogue
-- Importé du simulateur du formateur ; l'identifiant est celui du simulateur.
create table prestations (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  type type_prestation not null,
  nom text not null,
  destination text not null,
  prix_unitaire_cents integer not null check (prix_unitaire_cents >= 0),  -- par personne (hébergement : par personne et par nuit)
  capacite integer not null check (capacite > 0),
  description text,
  tags text[] not null default '{}',
  importe_le timestamptz not null default now(),
  actif boolean not null default true
);

-- ------------------------------------------------------------------ proposition
create table propositions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers (id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  statut statut_proposition not null default 'brouillon_en_cours',
  programme jsonb,                                  -- texte sans montant, validé par le schéma Zod BrouillonIA
  total_cents integer check (total_cents >= 0),     -- calculé par le code, jamais par l'IA
  alertes jsonb not null default '[]',
  ecarts jsonb,                                     -- Should
  motif_changement text,                            -- Should
  envoyee_le timestamptz,
  envoyee_par uuid references profils (id),
  cree_le timestamptz not null default now(),
  unique (dossier_id, version),
  check ((envoyee_le is null) = (envoyee_par is null))
);

-- Un poste au format du simulateur : une prestation, une date, un nombre de participants.
create table proposition_lignes (
  id uuid primary key default gen_random_uuid(),
  proposition_id uuid not null references propositions (id) on delete cascade,
  prestation_id text not null references prestations (id),
  date date not null,
  participants integer not null check (participants between 1 and 20),
  prix_unitaire_catalogue_cents integer not null check (prix_unitaire_catalogue_cents >= 0),  -- copie figée
  prix_confirme_cents integer check (prix_confirme_cents >= 0),
  source source_prix,
  confirme_le timestamptz,
  confirme_par uuid references profils (id),
  statut statut_ligne not null default 'a_verifier',
  total_ligne_cents integer generated always as
    (coalesce(prix_confirme_cents, prix_unitaire_catalogue_cents) * participants) stored,
  cree_le timestamptz not null default now(),
  -- un prix confirmé a toujours une source, une date et un auteur
  check ((prix_confirme_cents is null) = (source is null)
     and (prix_confirme_cents is null) = (confirme_le is null)
     and (prix_confirme_cents is null) = (confirme_par is null)),
  check (statut in ('a_verifier', 'indisponible', 'remplacee') or prix_confirme_cents is not null)
);

-- ------------------------------------------------------------------ agent, accord, option, réservation
-- Écrites par les cas d'usage côté serveur seulement ; le modèle n'y a aucun accès.
create table verifications (
  id uuid primary key default gen_random_uuid(),
  ligne_id uuid not null references proposition_lignes (id) on delete cascade,
  demande_par uuid not null references profils (id),
  statut statut_verification not null,
  prix_unitaire_cents integer check (prix_unitaire_cents >= 0),
  prix_total_cents integer check (prix_total_cents >= 0),
  places_restantes integer check (places_restantes >= 0),
  reponse_serveur jsonb,
  trace jsonb not null default '[]',               -- expurgée : ni clé ni donnée sensible
  modele text not null,
  nb_tours integer not null check (nb_tours between 0 and 3),
  arret arret_agent not null,
  cree_le timestamptz not null default now(),
  -- pas de prix ni de places si le simulateur a échoué ; toujours un prix sinon
  check (case when statut = 'echec'
              then prix_unitaire_cents is null and prix_total_cents is null and places_restantes is null
              else prix_unitaire_cents is not null and prix_total_cents is not null and places_restantes is not null end)
);

create table options (
  id uuid primary key default gen_random_uuid(),
  ligne_id uuid not null references proposition_lignes (id) on delete cascade,
  verification_id uuid not null references verifications (id),
  statut statut_option not null default 'accord_donne',
  -- accord du conseiller (étape 11) : usage unique, durée de vie courte
  accord_par uuid not null references profils (id),
  accord_le timestamptz not null default now(),
  accord_expire_le timestamptz not null default (now() + interval '10 minutes'),
  prix_accorde_cents integer not null check (prix_accorde_cents >= 0),  -- prix total autorisé pour la ligne
  accord_utilise boolean not null default false,
  -- option posée sur le simulateur (étape 12)
  option_id_simulateur text unique,
  prix_option_cents integer check (prix_option_cents >= 0),             -- prix figé par le simulateur à la pose
  expire_le timestamptz,
  reponse_option jsonb,
  -- seconde validation (étape 13) ; la clé d'approbation n'est jamais stockée
  confirme_par uuid references profils (id),
  confirme_le timestamptz,
  reservation_id_simulateur text unique,
  reponse_confirmation jsonb,
  annulee_le timestamptz,                           -- Could
  cree_le timestamptz not null default now(),
  check (accord_expire_le > accord_le),
  check (statut = 'accord_donne' or accord_utilise),
  check (statut not in ('posee', 'expiree', 'confirmee', 'annulee')
         or (option_id_simulateur is not null and prix_option_cents is not null and expire_le is not null)),
  -- on ne confirme que le prix que le conseiller a autorisé
  check (statut not in ('confirmee', 'annulee')
         or (reservation_id_simulateur is not null and confirme_par is not null and confirme_le is not null
             and prix_option_cents = prix_accorde_cents)),
  check (statut <> 'annulee' or annulee_le is not null)
);
-- une seule démarche en cours par ligne
create unique index options_une_en_cours_par_ligne on options (ligne_id) where statut in ('accord_donne', 'posee');

-- ------------------------------------------------------------------ journal
create table historique_dossier (
  id bigint generated always as identity primary key,
  dossier_id uuid not null references dossiers (id) on delete cascade,
  proposition_id uuid references propositions (id) on delete set null,
  type type_evenement not null,
  ancien_statut text,
  nouveau_statut text,
  auteur auteur_evenement not null,
  auteur_id uuid references profils (id),
  detail jsonb not null default '{}',               -- aucune donnée sensible ni clé
  cree_le timestamptz not null default now(),
  check ((auteur = 'conseiller') = (auteur_id is not null)),
  check (type <> 'statut' or nouveau_statut is not null)
);

create index on demandes (dossier_id);
create index on propositions (dossier_id);
create index on proposition_lignes (proposition_id);
create index on verifications (ligne_id);
create index on options (ligne_id);
create index on historique_dossier (dossier_id, cree_le);

-- ------------------------------------------------------------------ accès (RLS)
-- Le formulaire et les cas d'usage passent par le serveur (clé service_role, qui contourne la RLS).
-- Un conseiller connecté (profil existant) lit tout ; il n'écrit directement que ce qui relève de son écran.
create function est_conseiller() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profils where id = auth.uid());
$$;

alter table profils enable row level security;
alter table dossiers enable row level security;
alter table demandes enable row level security;
alter table fiches enable row level security;
alter table prestations enable row level security;
alter table propositions enable row level security;
alter table proposition_lignes enable row level security;
alter table verifications enable row level security;
alter table options enable row level security;
alter table historique_dossier enable row level security;

create policy lecture_conseiller on profils for select to authenticated using (est_conseiller());
create policy lecture_conseiller on dossiers for select to authenticated using (est_conseiller());
create policy lecture_conseiller on demandes for select to authenticated using (est_conseiller());
create policy lecture_conseiller on fiches for select to authenticated using (est_conseiller());
create policy lecture_conseiller on prestations for select to authenticated using (est_conseiller());
create policy lecture_conseiller on propositions for select to authenticated using (est_conseiller());
create policy lecture_conseiller on proposition_lignes for select to authenticated using (est_conseiller());
create policy lecture_conseiller on verifications for select to authenticated using (est_conseiller());
create policy lecture_conseiller on options for select to authenticated using (est_conseiller());
create policy lecture_conseiller on historique_dossier for select to authenticated using (est_conseiller());
-- Écritures : uniquement par les cas d'usage côté serveur. Aucune politique d'écriture pour authenticated ou anon.
