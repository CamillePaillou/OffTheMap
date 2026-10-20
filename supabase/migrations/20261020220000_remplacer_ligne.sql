-- Remplacer une ligne indisponible (E5.2), sans tout régénérer.
--
-- remplacer_ligne : la ligne indisponible passe à « remplacee » et une nouvelle ligne « a_verifier » est créée
-- pour une prestation du catalogue (prix catalogue copié, comme à la création par le brouillon) : une autre
-- prestation, ou la même à une autre date (le cas le plus courant : complet ce jour-là).
-- Date et participants sont repris de l'ancienne ligne s'ils ne sont pas donnés.
-- Les autres lignes, et leurs tarifs confirmés, ne sont pas touchées.
-- Comme changer_ligne (E5.1) : proposition verrouillée, figée une fois envoyée (OT008), ligne modifiée
-- entre-temps refusée (OT002), total recalculé, statut de la proposition qui suit (journal compris).
-- Nouveaux refus : prestation inconnue ou retirée du catalogue (OT010) ; même prestation à la même date (OT011).
-- Réservée au serveur (service_role). Renvoie l'identifiant de la nouvelle ligne.

create function remplacer_ligne(
  p_ligne uuid,
  p_prestation text,
  p_conseiller uuid,
  p_date date default null,
  p_participants integer default null
) returns uuid
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ancienne proposition_lignes%rowtype;
  v_prix integer;
  v_nouvelle uuid;
  v_bloquees integer;
  v_cible statut_proposition;
begin
  if p_conseiller is null then
    raise exception 'remplacement sans conseiller identifié' using errcode = 'OT003';
  end if;
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses lignes ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select * into v_ancienne from proposition_lignes where id = p_ligne for update;
  if v_ancienne.statut <> 'indisponible' then
    raise exception 'seule une ligne indisponible se remplace : trouvé %', v_ancienne.statut using errcode = 'OT002';
  end if;
  if p_prestation = v_ancienne.prestation_id and coalesce(p_date, v_ancienne.date) = v_ancienne.date then
    raise exception 'même prestation à la même date : choisir une autre prestation ou une autre date' using errcode = 'OT011';
  end if;
  select prix_unitaire_cents into v_prix from prestations where id = p_prestation and actif;
  if v_prix is null then
    raise exception 'prestation inconnue ou retirée du catalogue : %', p_prestation using errcode = 'OT010';
  end if;

  update proposition_lignes set statut = 'remplacee' where id = p_ligne;
  insert into proposition_lignes (proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents)
    values (v_proposition, p_prestation, coalesce(p_date, v_ancienne.date), coalesce(p_participants, v_ancienne.participants), v_prix)
    returning id into v_nouvelle;

  update propositions set total_cents = (
    select coalesce(sum(total_ligne_cents), 0) from proposition_lignes
    where proposition_id = v_proposition and statut not in ('remplacee', 'indisponible')
  ) where id = v_proposition;

  -- la nouvelle ligne est à vérifier : la proposition l'est aussi
  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = v_proposition and statut in ('a_verifier', 'indisponible');
  v_cible := case when v_bloquees = 0 then 'prete' else 'a_verifier' end;
  if v_cible <> v_statut then
    perform changer_statut('proposition', v_proposition, v_statut::text, v_cible::text, 'systeme', null,
      jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', v_statut, 'nouveau', v_cible));
  end if;
  return v_nouvelle;
end $$;

revoke execute on function remplacer_ligne(uuid, text, uuid, date, integer) from public, anon, authenticated;
grant execute on function remplacer_ligne(uuid, text, uuid, date, integer) to service_role;
