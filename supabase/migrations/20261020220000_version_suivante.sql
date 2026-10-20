-- Nouvelle version après un changement demandé par le client (E6.1). La version envoyée reste intacte : seul son
-- statut change (envoyee → changement_demande → remplacee) ; ses lignes, son programme, son total et sa date d'envoi
-- ne sont jamais modifiés. La version suivante porte le numéro suivant et repart « à vérifier ».
--
-- creer_version_suivante(proposition, conseiller, motif, résultat) :
--   - verrouille la version envoyée, qui doit être en envoyee ou sans_reponse (OT002 sinon : deux clics, ou la
--     proposition a été acceptée entre-temps) ;
--   - envoyee → changement_demande au nom du conseiller ;
--   - crée la version suivante en brouillon_en_cours, avec le motif du changement ;
--   - changement_demande → remplacee (garde : version suivante en brouillon_en_cours) ;
--   - écrit la version suivante par terminer_brouillon (E4.4) : lignes a_verifier, programme, total et alertes
--     calculés par le code, brouillon_en_cours → brouillon_pret → a_verifier.
-- Tout dans la même transaction, journal compris. Réservée au serveur (service_role).

create function creer_version_suivante(p_proposition uuid, p_conseiller uuid, p_motif text, p_resultat jsonb)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_version integer;
  v_suivante uuid;
begin
  select statut, dossier_id, version into v_statut, v_dossier, v_version from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  if v_statut not in ('envoyee', 'sans_reponse') then
    raise exception 'statut modifié entre-temps : attendu envoyee, trouvé %', v_statut using errcode = 'OT002';
  end if;
  if p_motif is null or char_length(btrim(p_motif)) = 0 then
    raise exception 'motif du changement requis' using errcode = 'OT005';
  end if;

  perform changer_statut('proposition', p_proposition, v_statut::text, 'changement_demande', 'conseiller', p_conseiller,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', v_statut, 'nouveau', 'changement_demande'));

  insert into propositions (dossier_id, version, statut, motif_changement)
    values (v_dossier, (select max(version) + 1 from propositions where dossier_id = v_dossier), 'brouillon_en_cours', btrim(p_motif))
    returning id into v_suivante;
  insert into historique_dossier (dossier_id, proposition_id, type, ancien_statut, nouveau_statut, auteur, detail)
    values (v_dossier, v_suivante, 'statut', null, 'brouillon_en_cours', 'systeme',
            jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', null, 'nouveau', 'brouillon_en_cours'));

  perform changer_statut('proposition', p_proposition, 'changement_demande', 'remplacee', 'systeme', null,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'changement_demande', 'nouveau', 'remplacee'));

  perform terminer_brouillon(v_suivante, p_resultat);
  return v_suivante;
end $$;

revoke execute on function creer_version_suivante(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function creer_version_suivante(uuid, uuid, text, jsonb) to service_role;
