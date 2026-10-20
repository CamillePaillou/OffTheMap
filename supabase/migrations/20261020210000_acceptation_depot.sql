-- Acceptation du client et dépôt reçu (E7.1) : deux clics du conseiller, journalisés.
--   1. enregistrer_reponse_client(proposition, 'acceptee', conseiller) : envoyee (ou sans_reponse) → acceptee.
--      Une seule proposition acceptée par dossier : le dossier est verrouillé, et une autre proposition déjà
--      acceptee, depot_recu ou reservee fait refuser (OT011).
--   2. enregistrer_reponse_client(proposition, 'depot_recu', conseiller) : acceptee → depot_recu. La réservation
--      peut alors commencer (accord, option, confirmation : E9.3 à E9.5).
-- Les transitions passent par changer_statut (E0.7) : statut et journal ensemble, OT002 si le statut a changé.
-- Réservée au serveur (service_role).

create function enregistrer_reponse_client(p_proposition uuid, p_nouveau statut_proposition, p_conseiller uuid)
returns bigint
language plpgsql set search_path = public as $$
declare
  v_dossier uuid;
  v_statut statut_proposition;
  v_ancien statut_proposition;
begin
  select dossier_id into v_dossier from propositions where id = p_proposition;
  if v_dossier is null then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
  perform 1 from dossiers where id = v_dossier for update;   -- une réponse à la fois par dossier
  select statut into v_statut from propositions where id = p_proposition for update;

  if p_nouveau = 'acceptee' then
    if v_statut not in ('envoyee', 'sans_reponse') then
      raise exception 'proposition au statut %, elle ne peut pas être acceptée', v_statut using errcode = 'OT002';
    end if;
    if exists (select 1 from propositions where dossier_id = v_dossier and id <> p_proposition
               and statut in ('acceptee', 'depot_recu', 'reservee')) then
      raise exception 'une autre proposition de ce dossier est déjà acceptée' using errcode = 'OT011';
    end if;
  elsif p_nouveau = 'depot_recu' then
    if v_statut <> 'acceptee' then
      raise exception 'proposition au statut %, le dépôt ne peut pas être enregistré', v_statut using errcode = 'OT002';
    end if;
  else
    raise exception 'réponse inconnue : %', p_nouveau using errcode = 'OT003';
  end if;

  v_ancien := v_statut;
  return changer_statut('proposition', p_proposition, v_ancien::text, p_nouveau::text, 'conseiller', p_conseiller,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', v_ancien, 'nouveau', p_nouveau));
end $$;

revoke execute on function enregistrer_reponse_client(uuid, statut_proposition, uuid) from public, anon, authenticated;
grant execute on function enregistrer_reponse_client(uuid, statut_proposition, uuid) to service_role;
