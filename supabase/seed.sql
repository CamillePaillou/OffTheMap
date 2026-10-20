-- Données de démonstration : catalogue de prestataires et dossier de Sophie.
-- Rejoué par `make seed` et par `make reset` (après les migrations).
-- À compléter quand les tables existeront (E0.16).
select 1;

-- Compte de démonstration du conseiller (E0.11), pour se connecter sur /connexion en local.
-- E-mail : conseiller@offthemap.test · mot de passe : offthemap-demo (base locale uniquement).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
  'conseiller@offthemap.test', extensions.crypt('offthemap-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'email',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"conseiller@offthemap.test","email_verified":true}',
  now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into profils (id, nom_affiche)
values ('11111111-1111-4111-8111-111111111111', 'Camille (démo)')
on conflict (id) do nothing;
