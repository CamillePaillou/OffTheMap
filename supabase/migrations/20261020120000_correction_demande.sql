-- Correction d'une demande depuis un lien (E1.2). Spécification : docs/specs/correction-demande.md.
--
-- 1. corrections : une ligne par lien envoyé au client. Le jeton n'est jamais stocké : seule son empreinte
--    SHA-256 l'est. Le lien est à usage unique (utilisee_le), expire (expire_le) et vise une version précise de
--    la demande. Deux boucles au plus par dossier (boucle 1 ou 2, unique par dossier).
-- 2. inserer_version_demande : insertion d'une version de demande, commune au dépôt (E1.1) et à la correction.
-- 3. demander_correction : le conseiller crée le lien ; le dossier doit être à corriger.
-- 4. lire_correction : état du lien et version à préremplir, sans rien modifier.
-- 5. corriger_demande : la version suivante, la version précédente marquée remplacee_le, le lien consommé et la
--    transition a_corriger → fiche_en_cours (journal compris) sont écrits ensemble, ou rien.
--    Le conseiller peut ajouter un petit commentaire par point signalé (commentaires), affiché sous le champ.
-- Toutes les fonctions sont réservées au serveur (service_role).
--
-- Codes d'erreur : OT004 dossier pas à corriger, OT005 deux boucles déjà faites, OT006 lien invalide.

-- Un commentaire par point signalé au plus : objet JSON dont chaque clé est un point de la correction et chaque
-- valeur un texte de 1 à 200 caractères.
create function commentaires_valides(p_commentaires jsonb, p_champs text[])
returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p_commentaires) = 'object'
     and not exists (
       select 1 from jsonb_each(p_commentaires) e
       where not (e.key = any (p_champs))
          or jsonb_typeof(e.value) <> 'string'
          or char_length(btrim(e.value #>> '{}')) not between 1 and 200
     )
$$;

create table corrections (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references dossiers (id) on delete cascade,
  demande_id uuid not null references demandes (id) on delete cascade,      -- version à corriger
  boucle integer not null check (boucle between 1 and 2),
  champs text[] not null check (
    cardinality(champs) between 1 and 10
    and champs <@ array['email', 'destination', 'dates', 'nb_nuits', 'voyageurs', 'budget',
                        'envies', 'contraintes', 'regimes', 'mobilite']
  ),
  motif text not null check (char_length(btrim(motif)) between 1 and 500),   -- lu par le client
  commentaires jsonb not null default '{}',          -- { point: petit commentaire }, lu par le client sous le champ
  jeton_hash text not null unique check (jeton_hash ~ '^[0-9a-f]{64}$'),
  demandee_par uuid not null references profils (id),
  expire_le timestamptz not null,
  utilisee_le timestamptz,
  nouvelle_demande_id uuid references demandes (id),                         -- version créée par le renvoi
  cree_le timestamptz not null default now(),
  unique (dossier_id, boucle),
  check ((utilisee_le is null) = (nouvelle_demande_id is null)),
  check (commentaires_valides(commentaires, champs))
);

alter table corrections enable row level security;
create policy lecture_conseiller on corrections for select to authenticated using (est_conseiller());

-- ------------------------------------------------------------------ insertion d'une version
create function inserer_version_demande(p_dossier uuid, p_version integer, p_demande jsonb)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_demande uuid;
begin
  insert into demandes (
    dossier_id, version, consentement_rgpd, consentement_ia, nom, email, destination,
    date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, regimes, mobilite
  ) values (
    p_dossier, p_version,
    coalesce((p_demande ->> 'consentement_rgpd')::boolean, false),
    coalesce((p_demande ->> 'consentement_ia')::boolean, false),
    p_demande ->> 'nom', p_demande ->> 'email', p_demande ->> 'destination',
    (p_demande ->> 'date_debut')::date, (p_demande ->> 'date_fin')::date,
    (p_demande ->> 'nb_nuits')::integer,
    array(select jsonb_array_elements_text(p_demande -> 'voyageurs'))::tranche_age[],
    (p_demande ->> 'budget_annonce_cents')::integer,
    p_demande ->> 'envies', p_demande ->> 'contraintes',
    array(select jsonb_array_elements_text(coalesce(p_demande -> 'regimes', '[]'::jsonb)))::regime[],
    (p_demande ->> 'mobilite')::mobilite
  ) returning id into v_demande;
  return v_demande;
end $$;

-- Le dépôt (E1.1) passe désormais par la même insertion : un seul endroit à tenir à jour.
create or replace function deposer_demande(p_demande jsonb)
returns table (dossier_id uuid, demande_id uuid)
language plpgsql set search_path = public as $$
declare
  v_dossier uuid;
  v_demande uuid;
begin
  insert into dossiers (statut) values ('nouvelle') returning id into v_dossier;
  v_demande := inserer_version_demande(v_dossier, 1, p_demande);
  insert into historique_dossier (dossier_id, type, ancien_statut, nouveau_statut, auteur, detail)
    values (v_dossier, 'statut', null, 'nouvelle', 'systeme',
            jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', null, 'nouveau', 'nouvelle'));
  return query select v_dossier, v_demande;
end $$;

-- ------------------------------------------------------------------ demander une correction
create function demander_correction(
  p_dossier uuid,
  p_champs text[],
  p_motif text,
  p_jeton_hash text,
  p_conseiller uuid,
  p_expire_le timestamptz,
  p_commentaires jsonb default '{}'
) returns table (correction_id uuid, boucle integer)
language plpgsql set search_path = public as $$
declare
  v_statut statut_dossier;
  v_demande uuid;
  v_boucle integer;
  v_correction uuid;
begin
  select statut into v_statut from dossiers where id = p_dossier for update;
  if not found then
    raise exception 'dossier introuvable : %', p_dossier using errcode = 'OT001';
  end if;
  if v_statut <> 'a_corriger' then
    raise exception 'le dossier n''est pas à corriger (statut %)', v_statut using errcode = 'OT004';
  end if;

  select id into v_demande from demandes
    where dossier_id = p_dossier and remplacee_le is null order by version desc limit 1;
  select count(*) + 1 into v_boucle from corrections c where c.dossier_id = p_dossier;
  if v_boucle > 2 then
    raise exception 'deux corrections déjà demandées pour ce dossier' using errcode = 'OT005';
  end if;

  -- un seul lien ouvert à la fois : le précédent, s'il court encore, expire maintenant
  update corrections c set expire_le = now()
    where c.dossier_id = p_dossier and c.utilisee_le is null and c.expire_le > now();

  insert into corrections (dossier_id, demande_id, boucle, champs, motif, commentaires, jeton_hash, demandee_par, expire_le)
    values (p_dossier, v_demande, v_boucle, p_champs, btrim(p_motif), coalesce(p_commentaires, '{}'), p_jeton_hash, p_conseiller, p_expire_le)
    returning id into v_correction;

  -- le journal ne garde ni le motif, ni les commentaires, ni le jeton
  insert into historique_dossier (dossier_id, type, auteur, auteur_id, detail)
    values (p_dossier, 'mail', 'conseiller', p_conseiller,
            jsonb_build_object('type', 'correction_demandee', 'boucle', v_boucle, 'champs', to_jsonb(p_champs)));

  return query select v_correction, v_boucle;
end $$;

-- ------------------------------------------------------------------ lire un lien
create function lire_correction(p_jeton_hash text)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  c corrections;
  v_statut statut_dossier;
  d demandes;
begin
  select * into c from corrections where jeton_hash = p_jeton_hash;
  if not found then return jsonb_build_object('etat', 'inconnu'); end if;
  if c.utilisee_le is not null then return jsonb_build_object('etat', 'utilise'); end if;
  if c.expire_le <= now() then return jsonb_build_object('etat', 'expire'); end if;

  select statut into v_statut from dossiers where id = c.dossier_id;
  select * into d from demandes where id = c.demande_id;
  if v_statut <> 'a_corriger' or d.remplacee_le is not null then
    return jsonb_build_object('etat', 'clos');
  end if;

  return jsonb_build_object(
    'etat', 'valide',
    'champs', to_jsonb(c.champs),
    'motif', c.motif,
    'commentaires', c.commentaires,
    'boucle', c.boucle,
    'expire_le', c.expire_le,
    'demande', jsonb_build_object(
      'nom', d.nom, 'email', d.email, 'destination', d.destination,
      'date_debut', d.date_debut, 'date_fin', d.date_fin, 'nb_nuits', d.nb_nuits,
      'voyageurs', to_jsonb(d.voyageurs), 'budget_annonce_cents', d.budget_annonce_cents,
      'envies', d.envies, 'contraintes', d.contraintes,
      'regimes', to_jsonb(d.regimes), 'mobilite', d.mobilite
    )
  );
end $$;

-- ------------------------------------------------------------------ renvoyer la demande corrigée
create function corriger_demande(p_jeton_hash text, p_demande jsonb)
returns table (demande_id uuid, version integer)
language plpgsql set search_path = public as $$
declare
  c corrections;
  v_statut statut_dossier;
  v_precedente demandes;
  v_nouvelle uuid;
begin
  select * into c from corrections where jeton_hash = p_jeton_hash for update;
  if not found then
    raise exception 'lien de correction inconnu' using errcode = 'OT006';
  end if;
  if c.utilisee_le is not null then
    raise exception 'lien de correction déjà utilisé' using errcode = 'OT006';
  end if;
  if c.expire_le <= now() then
    raise exception 'lien de correction expiré' using errcode = 'OT006';
  end if;

  select statut into v_statut from dossiers where id = c.dossier_id for update;
  select * into v_precedente from demandes where id = c.demande_id for update;
  if v_statut <> 'a_corriger' or v_precedente.remplacee_le is not null then
    raise exception 'le dossier n''attend plus de correction' using errcode = 'OT006';
  end if;

  v_nouvelle := inserer_version_demande(c.dossier_id, v_precedente.version + 1, p_demande);
  update demandes set remplacee_le = now() where id = v_precedente.id;
  update corrections set utilisee_le = now(), nouvelle_demande_id = v_nouvelle where id = c.id;

  -- même fonction de transition que partout ailleurs (E0.7) : statut et journal ensemble
  perform changer_statut('dossier', c.dossier_id, 'a_corriger', 'fiche_en_cours', 'systeme', null,
    jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'a_corriger', 'nouveau', 'fiche_en_cours',
                       'raison', 'nouvelle version de la demande reçue',
                       'version', v_precedente.version + 1, 'boucle', c.boucle));

  return query select v_nouvelle, v_precedente.version + 1;
end $$;

revoke execute on function commentaires_valides(jsonb, text[]) from public, anon, authenticated;
revoke execute on function inserer_version_demande(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function demander_correction(uuid, text[], text, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function lire_correction(text) from public, anon, authenticated;
revoke execute on function corriger_demande(text, jsonb) from public, anon, authenticated;
grant execute on function inserer_version_demande(uuid, integer, jsonb) to service_role;
grant execute on function demander_correction(uuid, text[], text, text, uuid, timestamptz, jsonb) to service_role;
grant execute on function lire_correction(text) to service_role;
grant execute on function corriger_demande(text, jsonb) to service_role;
