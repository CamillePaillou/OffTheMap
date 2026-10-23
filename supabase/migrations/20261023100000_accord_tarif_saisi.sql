-- Accord sur un tarif saisi à la main (retours du 23/10). Quand l'agent n'a pas pu vérifier le prix, le conseiller
-- peut confirmer le tarif obtenu auprès du prestataire (téléphone, mail, lien) : l'accord peut alors se fonder sur ce
-- tarif (règle `basePrixAccord`, src/domain/accord.ts). Le simulateur fait toujours foi : à la pose, un prix différent
-- de celui accordé est refusé (reponse_serveur_incoherente).
--
-- 1. options.verification_id devient facultatif : un accord sur tarif saisi n'a pas forcément de vérification.
--    La dernière vérification de la ligne reste rattachée quand il y en a une.
-- 2. enregistrer_accord reçoit la source du prix (agent, telephone, mail, lien) et la journalise. Sans vérification,
--    la ligne doit être confirmée avec un prix (OT003 sinon).

alter table options alter column verification_id drop not null;

drop function enregistrer_accord(uuid, uuid, timestamptz, timestamptz, integer);
create function enregistrer_accord(p_ligne uuid, p_conseiller uuid, p_accord_le timestamptz, p_expire_le timestamptz,
  p_prix_cents integer, p_source_prix source_prix default 'agent')
returns uuid
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_dossier uuid;
  v_verification uuid;
  v_option uuid;
begin
  select l.proposition_id, p.dossier_id into v_proposition, v_dossier
    from proposition_lignes l join propositions p on p.id = l.proposition_id where l.id = p_ligne for update of l;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select id into v_verification from verifications where ligne_id = p_ligne order by cree_le desc limit 1;
  if p_source_prix = 'agent' and v_verification is null then
    raise exception 'aucune vérification pour la ligne %', p_ligne using errcode = 'OT003';
  end if;
  if p_source_prix <> 'agent' and not exists (
    select 1 from proposition_lignes where id = p_ligne and statut = 'confirme' and prix_confirme_cents is not null) then
    raise exception 'aucun tarif confirmé pour la ligne %', p_ligne using errcode = 'OT003';
  end if;

  update options set statut = 'echec', accord_utilise = true
    where ligne_id = p_ligne and statut = 'accord_donne' and accord_expire_le <= p_accord_le;
  update options set statut = 'expiree'
    where ligne_id = p_ligne and statut = 'posee' and expire_le <= p_accord_le;

  begin
    insert into options (ligne_id, verification_id, accord_par, accord_le, accord_expire_le, prix_accorde_cents)
      values (p_ligne, v_verification, p_conseiller, p_accord_le, p_expire_le, p_prix_cents)
      returning id into v_option;
  exception when unique_violation then
    raise exception 'démarche déjà en cours sur la ligne %', p_ligne using errcode = 'OT012';
  end;

  insert into historique_dossier (dossier_id, proposition_id, type, auteur, auteur_id, detail)
    values (v_dossier, v_proposition, 'accord', 'conseiller', p_conseiller,
      jsonb_build_object('type', 'accord', 'option_id', v_option, 'ligne_id', p_ligne, 'prix_accorde_cents', p_prix_cents,
        'source_prix', p_source_prix));
  return v_option;
end $$;

revoke execute on function enregistrer_accord(uuid, uuid, timestamptz, timestamptz, integer, source_prix) from public, anon, authenticated;
grant execute on function enregistrer_accord(uuid, uuid, timestamptz, timestamptz, integer, source_prix) to service_role;
