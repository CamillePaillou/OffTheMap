-- Suivi de la demande par le client (espace client) : numéro de dossier, suivi public, « Mes demandes », réponse en ligne.
-- Spécification : docs/specs/espace-client.md.
--
-- 1. dossiers.reference : numéro lisible (« DT-7K4P-2QXM »), tiré au hasard, donné au client à l'envoi de sa demande.
-- 2. suivi_public(référence) : l'étape du dossier, comme le suivi d'un colis. Aucune donnée personnelle, aucun prix :
--    seulement les statuts et la date de la dernière mise à jour. Ouvert aux visiteurs (anon).
-- 3. Compte client : un client connecté retrouve les dossiers dont une version de la demande porte SON adresse e-mail,
--    et seulement si cette adresse est confirmée (auth.users.email_confirmed_at) : un inscrit ne voit pas la demande
--    d'un autre en s'inscrivant avec son adresse. mes_demandes() et ma_demande() lisent sous ce contrôle.
-- 4. reponses_client : le client accepte la proposition envoyée ou demande un changement, en ligne. La réponse est
--    enregistrée et montrée au conseiller, qui l'enregistre ensuite dans le dossier (E7.1, E6.1) : la matrice des
--    transitions ne change pas, une personne reste aux commandes.
-- Aucune table n'est ouverte au client : il passe par ces fonctions (security definer), qui contrôlent la propriété.

-- ------------------------------------------------------------------ 1. numéro de dossier
create function generer_reference() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sans 0, O, 1, I, L : lisible au téléphone
  octets bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  r text := 'DT-';
begin
  for i in 0..7 loop
    if i = 4 then r := r || '-'; end if;
    r := r || substr(alphabet, 1 + get_byte(octets, i) % length(alphabet), 1);
  end loop;
  return r;
end $$;

alter table dossiers add column reference text default generer_reference();
alter table dossiers alter column reference set not null;
alter table dossiers add constraint dossiers_reference_unique unique (reference);
alter table dossiers add constraint dossiers_reference_format check (reference ~ '^DT-[A-Z2-9]{4}-[A-Z2-9]{4}$');

-- ------------------------------------------------------------------ 2. suivi public
-- Numéro tel que le client le tape : casse, espaces et tirets libres (« dt jade nant », « JADENANT »).
create function normaliser_reference(p_saisie text) returns text
language sql immutable set search_path = public as $$
  select case when length(c) = 8 then 'DT-' || left(c, 4) || '-' || right(c, 4) end
  from (select regexp_replace(regexp_replace(upper(coalesce(p_saisie, '')), '[^A-Z0-9]', '', 'g'), '^DT(.{8})$', '\1') c) x
$$;

create function suivi_public(p_reference text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reference', d.reference,
    'dossier_statut', d.statut,
    'proposition_statut', (select p.statut from propositions p where p.dossier_id = d.id order by p.version desc limit 1),
    'mis_a_jour_le', coalesce((select max(h.cree_le) from historique_dossier h where h.dossier_id = d.id), d.cree_le)
  )
  from dossiers d
  where d.reference = normaliser_reference(p_reference)
$$;

-- ------------------------------------------------------------------ 4. réponses en ligne (table, avant les fonctions qui la lisent)
create table reponses_client (
  id uuid primary key default gen_random_uuid(),
  proposition_id uuid not null unique references propositions (id) on delete cascade, -- une réponse par version envoyée
  auteur uuid references auth.users (id) on delete set null,
  type text not null check (type in ('acceptee', 'changement')),
  message text check (message is null or char_length(btrim(message)) between 1 and 1000),
  cree_le timestamptz not null default now(),
  check (type = 'acceptee' or message is not null) -- un changement dit ce qui doit changer
);
alter table reponses_client enable row level security;
create policy lecture_conseiller on reponses_client for select to authenticated using (est_conseiller());
revoke all on reponses_client from anon;
grant select on reponses_client to authenticated; -- lecture filtrée par la politique : le conseiller seulement

-- ------------------------------------------------------------------ 3. compte client
-- Adresse confirmée du client connecté, en minuscules ; null si non connecté ou non confirmée.
create function email_client() returns text
language sql stable security definer set search_path = public, auth as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;

create function est_mon_dossier(p_dossier uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select email_client() is not null
     and exists (select 1 from demandes where dossier_id = p_dossier and lower(email) = email_client())
$$;

create function mes_demandes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.ligne order by x.cree_le desc), '[]'::jsonb)
  from (
    select d.cree_le, jsonb_build_object(
      'dossier_id', d.id,
      'reference', d.reference,
      'statut', d.statut,
      'cree_le', d.cree_le,
      'destination', v.destination,
      'date_debut', v.date_debut,
      'date_fin', v.date_fin,
      'proposition_statut', (select p.statut from propositions p where p.dossier_id = d.id order by p.version desc limit 1)
    ) as ligne
    from dossiers d
    join lateral (select * from demandes where dossier_id = d.id order by version desc limit 1) v on true
    where est_mon_dossier(d.id)
  ) x
$$;

-- Détail d'un dossier du client : sa demande, la dernière proposition envoyée (programme, prix vérifiés et datés),
-- et sa réponse en ligne s'il en a donné une. null si le dossier n'est pas le sien.
create function ma_demande(p_dossier uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'dossier_id', d.id,
    'reference', d.reference,
    'statut', d.statut,
    'cree_le', d.cree_le,
    -- la réponse en ligne du client compte aussi : il voit la date de sa dernière action
    'mis_a_jour_le', greatest(coalesce((select max(h.cree_le) from historique_dossier h where h.dossier_id = d.id), d.cree_le),
      (select max(r.cree_le) from reponses_client r join propositions p on p.id = r.proposition_id where p.dossier_id = d.id)),
    'proposition_statut', (select p.statut from propositions p where p.dossier_id = d.id order by p.version desc limit 1),
    'demande', (select jsonb_build_object(
        'destination', v.destination, 'date_debut', v.date_debut, 'date_fin', v.date_fin, 'nb_nuits', v.nb_nuits,
        'voyageurs', cardinality(v.voyageurs), 'envies', v.envies)
      from demandes v where v.dossier_id = d.id order by v.version desc limit 1),
    'proposition', (select jsonb_build_object(
        'id', p.id, 'version', p.version, 'statut', p.statut, 'envoyee_le', p.envoyee_le,
        'programme', p.programme, 'total_cents', p.total_cents,
        'conseiller', (select nom_affiche from profils where id = p.envoyee_par),
        'lignes', coalesce((select jsonb_agg(jsonb_build_object(
            'nom', pr.nom, 'type', pr.type, 'date', l.date, 'participants', l.participants,
            'prix_unitaire_cents', l.prix_confirme_cents, 'confirme_le', l.confirme_le, 'statut', l.statut)
            order by l.date, pr.type)
          from proposition_lignes l join prestations pr on pr.id = l.prestation_id
          where l.proposition_id = p.id and l.statut::text not in ('remplacee', 'indisponible', 'retiree')), '[]'::jsonb),
        'reponse', (select jsonb_build_object('type', r.type, 'message', r.message, 'cree_le', r.cree_le)
          from reponses_client r where r.proposition_id = p.id))
      from propositions p where p.dossier_id = d.id and p.envoyee_le is not null order by p.version desc limit 1)
  )
  from dossiers d
  where d.id = p_dossier and est_mon_dossier(d.id)
$$;

-- OT020 : proposition introuvable ou pas au client ; OT021 : proposition plus en attente de réponse ; 23505 : déjà répondu.
create function repondre_proposition(p_proposition uuid, p_type text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dossier uuid;
  v_statut statut_proposition;
  v_derniere integer;
  v_version integer;
begin
  select dossier_id, statut, version into v_dossier, v_statut, v_version from propositions where id = p_proposition for update;
  if v_dossier is null or not est_mon_dossier(v_dossier) then
    raise exception 'proposition introuvable' using errcode = 'OT020';
  end if;
  select max(version) into v_derniere from propositions where dossier_id = v_dossier;
  if v_statut not in ('envoyee', 'sans_reponse') or v_version <> v_derniere then
    raise exception 'proposition au statut %, plus en attente de réponse', v_statut using errcode = 'OT021';
  end if;
  insert into reponses_client (proposition_id, auteur, type, message)
    values (p_proposition, auth.uid(), p_type, nullif(btrim(coalesce(p_message, '')), ''));
end $$;

-- ------------------------------------------------------------------ droits
revoke execute on function generer_reference() from public, anon, authenticated;
grant execute on function generer_reference() to service_role;
revoke execute on function email_client() from public, anon;
revoke execute on function est_mon_dossier(uuid) from public, anon;
revoke execute on function mes_demandes() from public, anon;
revoke execute on function ma_demande(uuid) from public, anon;
revoke execute on function repondre_proposition(uuid, text, text) from public, anon;
grant execute on function suivi_public(text), normaliser_reference(text) to anon, authenticated, service_role;
grant execute on function email_client(), est_mon_dossier(uuid), mes_demandes(), ma_demande(uuid), repondre_proposition(uuid, text, text)
  to authenticated, service_role;
