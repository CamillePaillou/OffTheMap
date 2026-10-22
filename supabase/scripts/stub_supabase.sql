-- Remplace ce que Supabase fournit (schéma auth, rôles), pour tester la migration sur un PostgreSQL nu, hors Supabase.
-- Inutile sur la base Supabase locale.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz,
  updated_at timestamptz, confirmation_token text, recovery_token text, email_change text, email_change_token_new text
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users (id) on delete cascade, provider_id text, provider text,
  identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  unique (provider_id, provider)
);
-- Supabase installe pgcrypto dans le schéma extensions (utilisé par le seed).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- même définition que Supabase : l'ancien réglage request.jwt.claim.sub, ou les claims posées par PostgREST
create function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                     (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
