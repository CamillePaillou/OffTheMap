-- Abandonner un dossier sans réponse (E6.5). Spécification : docs/specs/abandon-sans-reponse.md.
--
-- 1. enregistrer_rappel accepte aussi J+14 : le rappel qui propose l'abandon au conseiller (statut inchangé).
-- 2. abandonner_dossier(proposition, conseiller) : appelé par le serveur (cas d'usage abandonnerDossier) quand le
--    conseiller confirme l'abandon :
--      - verrouille le dossier, puis la proposition, qui doit être sans_reponse (OT002 sinon : réponse ou changement
--        enregistré entre-temps) ;
--      - refuse avant J+14 après l'envoi (OT012) ;
--      - en_proposition → abandonnee au nom du conseiller, par changer_statut (E0.7 ; OT002 si le dossier a changé).
--    Tout dans la même transaction. Réservée au serveur (service_role).
-- 3. Un dossier abandonné est clos : plus aucune proposition n'y est créée ni ne change de statut (OT002).

create or replace function enregistrer_rappel(p_proposition uuid, p_jour integer)
returns bigint                 -- id de la ligne d'historique du rappel
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_envoyee timestamptz;
  v_historique bigint;
begin
  if p_jour is null or p_jour not in (3, 7, 14) then
    raise exception 'jour de rappel inconnu : %', p_jour using errcode = 'OT003';
  end if;

  select statut, dossier_id, envoyee_le into v_statut, v_dossier, v_envoyee from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('envoyee', 'sans_reponse') then
    raise exception 'statut modifié entre-temps : attendu envoyee ou sans_reponse, trouvé %', v_statut using errcode = 'OT002';
  end if;
  if v_envoyee is null or now() < v_envoyee + make_interval(days => p_jour) then
    raise exception 'rappel J+% avant son jour', p_jour using errcode = 'OT012';
  end if;
  if exists (select 1 from historique_dossier where proposition_id = p_proposition and type = 'rappel'
             and (detail ->> 'jour')::integer >= p_jour) then
    raise exception 'rappel J+% déjà fait', p_jour using errcode = 'OT002';
  end if;

  if v_statut = 'envoyee' then
    perform changer_statut('proposition', p_proposition, 'envoyee', 'sans_reponse', 'systeme', null,
      jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'envoyee', 'nouveau', 'sans_reponse'));
  end if;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, detail)
    values (v_dossier, p_proposition, 'rappel', 'systeme', jsonb_build_object('type', 'rappel', 'jour', p_jour))
    returning id into v_historique;
  return v_historique;
end $$;

create function abandonner_dossier(p_proposition uuid, p_conseiller uuid)
returns bigint                 -- id de la ligne d'historique du changement de statut du dossier
language plpgsql set search_path = public as $$
declare
  v_dossier uuid;
  v_statut statut_proposition;
  v_envoyee timestamptz;
begin
  if p_conseiller is null then
    raise exception 'abandon sans conseiller identifié' using errcode = 'OT003';
  end if;
  select dossier_id into v_dossier from propositions where id = p_proposition;
  if v_dossier is null then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  perform 1 from dossiers where id = v_dossier for update;   -- même ordre de verrous que enregistrer_reponse_client
  select statut, envoyee_le into v_statut, v_envoyee from propositions where id = p_proposition for update;

  if v_statut <> 'sans_reponse' then
    raise exception 'proposition au statut %, le dossier ne peut pas être abandonné', v_statut using errcode = 'OT002';
  end if;
  if v_envoyee is null or now() < v_envoyee + interval '14 days' then
    raise exception 'abandon proposé à J+14 seulement' using errcode = 'OT012';
  end if;

  return changer_statut('dossier', v_dossier, 'en_proposition', 'abandonnee', 'conseiller', p_conseiller,
    jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'en_proposition', 'nouveau', 'abandonnee'));
end $$;

revoke execute on function abandonner_dossier(uuid, uuid) from public, anon, authenticated;
grant execute on function abandonner_dossier(uuid, uuid) to service_role;

-- un dossier abandonné est clos : ni acceptation, ni changement, ni nouvelle version après coup
create function refuser_proposition_dossier_abandonne()
returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from dossiers where id = new.dossier_id and statut = 'abandonnee') then
    raise exception 'dossier abandonné : la proposition ne peut plus changer' using errcode = 'OT002';
  end if;
  return new;
end $$;

create trigger propositions_dossier_abandonne
  before insert or update of statut on propositions
  for each row execute function refuser_proposition_dossier_abandonne();
