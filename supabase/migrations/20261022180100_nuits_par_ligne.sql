-- Nuits d'une ligne d'hébergement (retours du 22/10). Une demande de 5 nuits donnait une seule ligne d'hôtel à une
-- nuit, et le conseiller ajoutait les autres à la main. Une ligne d'hébergement porte désormais son nombre de nuits,
-- à partir de sa date (première nuit) ; les autres types en ont toujours 1 (vérifié par le code).
-- Total de la ligne = prix unitaire (par personne et par nuit) × participants × nuits.
--
-- terminer_brouillon lit « nb_nuits » dans chaque ligne (1 par défaut). remplacer_ligne garde les nuits de la ligne
-- remplacée si la remplaçante est un hébergement. ajouter_ligne et modifier_ligne reçoivent les nuits (OT012 si une
-- ligne qui n'est pas un hébergement en reçoit plus d'une). Les lignes existantes valent 1 nuit : totaux inchangés.

alter table proposition_lignes add column nb_nuits integer not null default 1 check (nb_nuits between 1 and 14);
alter table proposition_lignes alter column total_ligne_cents set expression as
  (coalesce(prix_confirme_cents, prix_unitaire_catalogue_cents) * participants * nb_nuits);

-- nuits acceptées pour une prestation : plusieurs pour un hébergement seulement
create function verifier_nuits(p_prestation text, p_nb_nuits integer)
returns void
language plpgsql set search_path = public as $$
begin
  if p_nb_nuits > 1 and (select type from prestations where id = p_prestation) <> 'hebergement' then
    raise exception 'seul un hébergement compte plusieurs nuits : %', p_prestation using errcode = 'OT012';
  end if;
end $$;

create or replace function terminer_brouillon(p_proposition uuid, p_resultat jsonb)
returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_detail jsonb;
begin
  select statut into v_statut from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut <> 'brouillon_en_cours' then
    raise exception 'statut modifié entre-temps : attendu brouillon_en_cours, trouvé %', v_statut using errcode = 'OT002';
  end if;

  v_detail := jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'brouillon_en_cours');
  if p_resultat ? 'erreur' then
    perform changer_statut('proposition', p_proposition, 'brouillon_en_cours', 'erreur', 'systeme', null,
      v_detail || jsonb_build_object('nouveau', 'erreur'));
    return 'erreur';
  end if;

  perform verifier_nuits(l ->> 'prestation_id', coalesce((l ->> 'nb_nuits')::integer, 1))
    from jsonb_array_elements(p_resultat -> 'lignes') l;
  insert into proposition_lignes (id, proposition_id, prestation_id, date, participants, nb_nuits, prix_unitaire_catalogue_cents, statut)
    select (l ->> 'id')::uuid, p_proposition, l ->> 'prestation_id', (l ->> 'date')::date, (l ->> 'participants')::integer,
           coalesce((l ->> 'nb_nuits')::integer, 1), (l ->> 'prix_unitaire_catalogue_cents')::integer, 'a_verifier'
    from jsonb_array_elements(p_resultat -> 'lignes') l;

  update propositions set
    programme = p_resultat -> 'programme',
    total_cents = (p_resultat ->> 'total_cents')::integer,
    alertes = coalesce(p_resultat -> 'alertes', '[]')
  where id = p_proposition;

  perform changer_statut('proposition', p_proposition, 'brouillon_en_cours', 'brouillon_pret', 'systeme', null,
    v_detail || jsonb_build_object('nouveau', 'brouillon_pret'));
  perform changer_statut('proposition', p_proposition, 'brouillon_pret', 'a_verifier', 'systeme', null,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'brouillon_pret', 'nouveau', 'a_verifier'));
  return 'a_verifier';
end $$;

drop function ajouter_ligne(uuid, text, date, integer, uuid);
create function ajouter_ligne(
  p_proposition uuid,
  p_prestation text,
  p_date date,
  p_participants integer,
  p_conseiller uuid,
  p_nb_nuits integer default 1
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_prix integer;
  v_nouvelle uuid;
begin
  if p_conseiller is null then
    raise exception 'ajout sans conseiller identifié' using errcode = 'OT003';
  end if;
  select statut into v_statut from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select prix_unitaire_cents into v_prix from prestations where id = p_prestation and actif;
  if v_prix is null then
    raise exception 'prestation inconnue ou retirée du catalogue : %', p_prestation using errcode = 'OT010';
  end if;
  if exists (select 1 from proposition_lignes where proposition_id = p_proposition and prestation_id = p_prestation
             and date = p_date and statut not in ('remplacee', 'indisponible')) then
    raise exception 'la prestation % est déjà prévue le %', p_prestation, p_date using errcode = 'OT011';
  end if;
  perform verifier_nuits(p_prestation, p_nb_nuits);

  insert into proposition_lignes (proposition_id, prestation_id, date, participants, nb_nuits, prix_unitaire_catalogue_cents)
    values (p_proposition, p_prestation, p_date, p_participants, p_nb_nuits, v_prix)
    returning id into v_nouvelle;
  perform suivre_proposition(p_proposition, v_statut);
  return v_nouvelle;
end $$;

drop function modifier_ligne(uuid, uuid, date, integer);
create function modifier_ligne(
  p_ligne uuid,
  p_conseiller uuid,
  p_date date default null,
  p_participants integer default null,
  p_nb_nuits integer default null
) returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ligne proposition_lignes%rowtype;
  v_date date;
  v_participants integer;
  v_nuits integer;
begin
  if p_conseiller is null then
    raise exception 'modification sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select * into v_ligne from proposition_lignes where id = p_ligne for update;
  if v_ligne.statut not in ('a_verifier', 'confirme', 'indisponible') then
    raise exception 'ligne au statut %, elle ne se modifie plus', v_ligne.statut using errcode = 'OT002';
  end if;
  v_date := coalesce(p_date, v_ligne.date);
  v_participants := coalesce(p_participants, v_ligne.participants);
  v_nuits := coalesce(p_nb_nuits, v_ligne.nb_nuits);
  if v_date = v_ligne.date and v_participants = v_ligne.participants and v_nuits = v_ligne.nb_nuits then
    raise exception 'rien ne change : même date, mêmes participants et mêmes nuits' using errcode = 'OT011';
  end if;
  if v_date <> v_ligne.date and exists (
    select 1 from proposition_lignes where proposition_id = v_proposition and prestation_id = v_ligne.prestation_id
      and date = v_date and id <> p_ligne and statut not in ('remplacee', 'indisponible')) then
    raise exception 'la prestation % est déjà prévue le %', v_ligne.prestation_id, v_date using errcode = 'OT011';
  end if;
  perform verifier_nuits(v_ligne.prestation_id, v_nuits);

  -- à vérifier, sans prix confirmé : le tarif obtenu ne vaut plus pour une autre date, un autre groupe ou d'autres nuits
  update proposition_lignes set
    date = v_date, participants = v_participants, nb_nuits = v_nuits, statut = 'a_verifier',
    prix_confirme_cents = null, source = null, confirme_le = null, confirme_par = null
  where id = p_ligne;
  return suivre_proposition(v_proposition, v_statut);
end $$;

-- E7.4, sans changement de signature : la remplaçante d'un hébergement garde ses nuits
create or replace function remplacer_ligne(
  p_ligne uuid,
  p_prestation text,
  p_conseiller uuid,
  p_date date default null,
  p_participants integer default null,
  p_accord_client boolean default false
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ancienne proposition_lignes%rowtype;
  v_prix integer;
  v_type type_prestation;
  v_nouvelle uuid;
  v_participants integer;
  v_nuits integer;
begin
  if p_conseiller is null then
    raise exception 'remplacement sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete', 'depot_recu') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  if v_statut = 'depot_recu' and not p_accord_client then
    raise exception 'proposition acceptée : le remplacement demande l''accord du client' using errcode = 'OT013';
  end if;
  select * into v_ancienne from proposition_lignes where id = p_ligne for update;
  if v_ancienne.statut <> 'indisponible' then
    raise exception 'seule une ligne indisponible se remplace : trouvé %', v_ancienne.statut using errcode = 'OT002';
  end if;
  if p_prestation = v_ancienne.prestation_id and coalesce(p_date, v_ancienne.date) = v_ancienne.date then
    raise exception 'même prestation à la même date : choisir une autre prestation ou une autre date' using errcode = 'OT011';
  end if;
  select prix_unitaire_cents, type into v_prix, v_type from prestations where id = p_prestation and actif;
  if v_prix is null then
    raise exception 'prestation inconnue ou retirée du catalogue : %', p_prestation using errcode = 'OT010';
  end if;

  v_participants := coalesce(p_participants, v_ancienne.participants);
  v_nuits := case when v_type = 'hebergement' then v_ancienne.nb_nuits else 1 end;
  update proposition_lignes set statut = 'remplacee' where id = p_ligne;
  insert into proposition_lignes (proposition_id, prestation_id, date, participants, nb_nuits, prix_unitaire_catalogue_cents)
    values (v_proposition, p_prestation, coalesce(p_date, v_ancienne.date), v_participants, v_nuits, v_prix)
    returning id into v_nouvelle;

  if v_statut = 'depot_recu' then
    perform journaliser_changement_ligne(v_proposition, p_conseiller, jsonb_build_object('type', 'remplacement',
      'ligne_id', p_ligne, 'nouvelle_ligne_id', v_nouvelle, 'ancienne_prestation', v_ancienne.prestation_id,
      'nouvelle_prestation', p_prestation, 'ancien_total_cents', v_ancienne.total_ligne_cents,
      'nouveau_total_catalogue_cents', v_prix * v_participants * v_nuits, 'accord_client', true));
  end if;
  perform suivre_proposition(v_proposition, v_statut);
  return v_nouvelle;
end $$;

revoke execute on function verifier_nuits(text, integer) from public, anon, authenticated;
grant execute on function verifier_nuits(text, integer) to service_role;
revoke execute on function ajouter_ligne(uuid, text, date, integer, uuid, integer) from public, anon, authenticated;
grant execute on function ajouter_ligne(uuid, text, date, integer, uuid, integer) to service_role;
revoke execute on function modifier_ligne(uuid, uuid, date, integer, integer) from public, anon, authenticated;
grant execute on function modifier_ligne(uuid, uuid, date, integer, integer) to service_role;
