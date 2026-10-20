-- Brouillon de proposition (E4.4). Le modèle propose un programme sans montant et des lignes (prestation, date,
-- participants) ; le code copie les prix du catalogue, calcule total et alertes (E4.2), puis tout est écrit ensemble.
--
-- demarrer_brouillon(dossier, conseiller) : appelé au clic « Générer le brouillon ».
--   - dossier en entretien_fait : la fiche doit avoir budget réel et dates fixes ; elle est validée (validee_par,
--     validee_le) et le dossier passe en en_proposition (garde de la matrice), au nom du conseiller ;
--   - le dossier doit alors être en en_proposition et sans proposition (OT004 sinon : un brouillon existe déjà) ;
--   - crée la proposition (version suivante) au statut brouillon_en_cours, journal compris.
--   Le dossier est verrouillé : deux clics simultanés ne créent qu'une proposition.
--
-- terminer_brouillon(proposition, résultat) : appelé par le serveur à la fin de la génération.
--   - la proposition doit être en brouillon_en_cours (OT002 sinon) ;
--   - résultat {"erreur": "..."} : statut erreur (bouton « relancer ») ;
--   - sinon : lignes créées au statut a_verifier (prix catalogue figé), programme, total et alertes écrits,
--     puis brouillon_en_cours → brouillon_pret → a_verifier par changer_statut, journal compris.
-- Réservées au serveur (service_role).

create function demarrer_brouillon(p_dossier uuid, p_conseiller uuid)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_statut statut_dossier;
  v_fiche fiches%rowtype;
  v_proposition uuid;
  v_version integer;
begin
  select statut into v_statut from dossiers where id = p_dossier for update;
  if not found then
    raise exception 'dossier introuvable : %', p_dossier using errcode = 'OT001';
  end if;

  if v_statut = 'entretien_fait' then
    select f.* into v_fiche from fiches f join demandes d on d.id = f.demande_id
      where d.dossier_id = p_dossier and d.remplacee_le is null;
    if v_fiche.id is null or v_fiche.budget_reel_cents is null or v_fiche.date_debut_fixe is null or v_fiche.date_fin_fixe is null then
      raise exception 'fiche incomplète : budget réel et dates fixes requis' using errcode = 'OT005';
    end if;
    if v_fiche.validee_par is null then
      update fiches set validee_par = p_conseiller, validee_le = now() where id = v_fiche.id;
    end if;
    perform changer_statut('dossier', p_dossier, 'entretien_fait', 'en_proposition', 'conseiller', p_conseiller,
      jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', 'entretien_fait', 'nouveau', 'en_proposition'));
    v_statut := 'en_proposition';
  end if;

  if v_statut <> 'en_proposition' then
    raise exception 'statut modifié entre-temps : attendu en_proposition, trouvé %', v_statut using errcode = 'OT002';
  end if;
  if exists (select 1 from propositions where dossier_id = p_dossier) then
    raise exception 'le dossier % a déjà une proposition', p_dossier using errcode = 'OT004';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from propositions where dossier_id = p_dossier;
  insert into propositions (dossier_id, version, statut) values (p_dossier, v_version, 'brouillon_en_cours')
    returning id into v_proposition;
  insert into historique_dossier (dossier_id, proposition_id, type, ancien_statut, nouveau_statut, auteur, detail)
    values (p_dossier, v_proposition, 'statut', null, 'brouillon_en_cours', 'systeme',
            jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', null, 'nouveau', 'brouillon_en_cours'));
  return v_proposition;
end $$;

-- p_resultat : {"erreur": "..."} ou
-- {"programme": [...], "total_cents": n, "alertes": [...],
--  "lignes": [{"id", "prestation_id", "date", "participants", "prix_unitaire_catalogue_cents"}]}
create function terminer_brouillon(p_proposition uuid, p_resultat jsonb)
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

  insert into proposition_lignes (id, proposition_id, prestation_id, date, participants, prix_unitaire_catalogue_cents, statut)
    select (l ->> 'id')::uuid, p_proposition, l ->> 'prestation_id', (l ->> 'date')::date, (l ->> 'participants')::integer,
           (l ->> 'prix_unitaire_catalogue_cents')::integer, 'a_verifier'
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

revoke execute on function demarrer_brouillon(uuid, uuid) from public, anon, authenticated;
grant execute on function demarrer_brouillon(uuid, uuid) to service_role;
revoke execute on function terminer_brouillon(uuid, jsonb) from public, anon, authenticated;
grant execute on function terminer_brouillon(uuid, jsonb) to service_role;
