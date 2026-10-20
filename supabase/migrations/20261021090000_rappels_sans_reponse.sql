-- Rappels quand le client ne répond pas (E6.4). Spécification : docs/specs/rappels.md.
--
-- enregistrer_rappel(proposition, jour) : appelé par le serveur (cas d'usage rappelerSansReponse) quand une proposition
-- envoyée attend une réponse du client depuis 3 jours, puis 7 :
--   - verrouille la proposition, qui doit être envoyee ou sans_reponse (OT002 sinon : réponse ou changement
--     enregistré entre-temps) ;
--   - refuse un rappel avant son jour (OT012), ou déjà fait, lui ou un plus tardif (OT002 : deux appels simultanés) ;
--   - au premier rappel, envoyee → sans_reponse au nom du système, par changer_statut (E0.7) ;
--   - journalise le rappel : historique_dossier de type rappel, détail {"type": "rappel", "jour": 3}.
-- Tout dans la même transaction. Réservée au serveur (service_role).

-- un seul rappel par jour et par proposition, même si deux écrans s'ouvrent en même temps
create unique index historique_un_rappel_par_jour on historique_dossier (proposition_id, (detail ->> 'jour')) where type = 'rappel';

create function enregistrer_rappel(p_proposition uuid, p_jour integer)
returns bigint                 -- id de la ligne d'historique du rappel
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_dossier uuid;
  v_envoyee timestamptz;
  v_historique bigint;
begin
  if p_jour is null or p_jour not in (3, 7) then
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

revoke execute on function enregistrer_rappel(uuid, integer) from public, anon, authenticated;
grant execute on function enregistrer_rappel(uuid, integer) to service_role;
