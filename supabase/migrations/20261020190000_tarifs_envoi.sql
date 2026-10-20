-- Confirmer les tarifs et n'envoyer que des prix vérifiés (E5.1).
--
-- 1. changer_ligne : le conseiller confirme un tarif (prix, source ; date et auteur posés ici), marque une ligne
--    indisponible, ou la repasse à vérifier. La proposition est verrouillée pendant l'écriture : deux changements
--    de lignes ne se croisent pas. Le total est recalculé en base (somme des lignes hors remplacee et indisponible,
--    sans marge : docs/specs/chiffrage.md), et le statut de la proposition suit :
--      a_verifier → prete quand plus aucune ligne n'est à vérifier ni indisponible ; prete → a_verifier sinon.
--    Une proposition envoyée (ou au-delà) n'est plus modifiable par ce biais (OT008).
-- 2. enregistrer_alertes : les alertes recalculées par le code (chiffrer, E4.2) après chaque changement.
-- 3. envoyer_proposition : prete → envoyee au nom du conseiller, seulement si aucune ligne n'est à vérifier ni
--    indisponible ET aucune alerte bloquante (OT009) ; envoyee_le et envoyee_par sont posés en même temps.
--    La liste des alertes bloquantes doit rester celle de types/chiffrage.ts (un test le vérifie).
-- Toutes réservées au serveur (service_role).

create function changer_ligne(
  p_ligne uuid,
  p_ancien statut_ligne,
  p_nouveau statut_ligne,
  p_prix_cents integer,
  p_source source_prix,
  p_conseiller uuid
) returns statut_proposition
language plpgsql set search_path = public as $$
declare
  v_proposition uuid;
  v_statut statut_proposition;
  v_ligne statut_ligne;
  v_bloquees integer;
  v_cible statut_proposition;
begin
  select l.proposition_id into v_proposition from proposition_lignes l where l.id = p_ligne;
  if v_proposition is null then
    raise exception 'ligne introuvable : %', p_ligne using errcode = 'OT001';
  end if;
  select statut into v_statut from propositions where id = v_proposition for update;
  if v_statut not in ('a_verifier', 'prete') then
    raise exception 'proposition au statut %, ses tarifs ne se modifient plus', v_statut using errcode = 'OT008';
  end if;
  select statut into v_ligne from proposition_lignes where id = p_ligne for update;
  if v_ligne is distinct from p_ancien then
    raise exception 'ligne modifiée entre-temps : attendu %, trouvé %', p_ancien, v_ligne using errcode = 'OT002';
  end if;

  if p_nouveau = 'confirme' then
    update proposition_lignes
      set statut = 'confirme', prix_confirme_cents = p_prix_cents, source = p_source, confirme_le = now(), confirme_par = p_conseiller
      where id = p_ligne;
  else
    -- à vérifier ou indisponible : l'ancien tarif confirmé ne vaut plus
    update proposition_lignes
      set statut = p_nouveau, prix_confirme_cents = null, source = null, confirme_le = null, confirme_par = null
      where id = p_ligne;
  end if;

  update propositions set total_cents = (
    select coalesce(sum(total_ligne_cents), 0) from proposition_lignes
    where proposition_id = v_proposition and statut not in ('remplacee', 'indisponible')
  ) where id = v_proposition;

  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = v_proposition and statut in ('a_verifier', 'indisponible');
  v_cible := case when v_bloquees = 0 then 'prete' else 'a_verifier' end;
  if v_cible <> v_statut then
    perform changer_statut('proposition', v_proposition, v_statut::text, v_cible::text, 'systeme', null,
      jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', v_statut, 'nouveau', v_cible));
  end if;
  return v_cible;
end $$;

create function enregistrer_alertes(p_proposition uuid, p_alertes jsonb)
returns void
language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(p_alertes) <> 'array' then
    raise exception 'alertes : tableau attendu' using errcode = 'OT003';
  end if;
  update propositions set alertes = p_alertes where id = p_proposition;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;
end $$;

create function envoyer_proposition(p_proposition uuid, p_conseiller uuid)
returns bigint
language plpgsql set search_path = public as $$
declare
  v_statut statut_proposition;
  v_bloquees integer;
  v_alertes integer;
  v_historique bigint;
begin
  select statut into v_statut from propositions where id = p_proposition for update;
  if not found then
    raise exception 'proposition introuvable : %', p_proposition using errcode = 'OT001';
  end if;

  select count(*) into v_bloquees from proposition_lignes
    where proposition_id = p_proposition and statut in ('a_verifier', 'indisponible');
  select count(*) into v_alertes from propositions p, jsonb_array_elements(p.alertes) a
    where p.id = p_proposition
      and a ->> 'code' in ('capacite_depassee', 'participants_superieurs_voyageurs', 'date_hors_sejour', 'prestation_inactive');
  if v_bloquees > 0 or v_alertes > 0 then
    raise exception 'envoi refusé : % ligne(s) à vérifier ou indisponible(s), % alerte(s) bloquante(s)', v_bloquees, v_alertes
      using errcode = 'OT009';
  end if;

  -- prete → envoyee par la fonction de transition : refusée (OT002) depuis tout autre statut
  v_historique := changer_statut('proposition', p_proposition, 'prete', 'envoyee', 'conseiller', p_conseiller,
    jsonb_build_object('type', 'statut', 'cible', 'proposition', 'ancien', 'prete', 'nouveau', 'envoyee'));
  update propositions set envoyee_le = now(), envoyee_par = p_conseiller where id = p_proposition;
  return v_historique;
end $$;

revoke execute on function changer_ligne(uuid, statut_ligne, statut_ligne, integer, source_prix, uuid) from public, anon, authenticated;
revoke execute on function enregistrer_alertes(uuid, jsonb) from public, anon, authenticated;
revoke execute on function envoyer_proposition(uuid, uuid) from public, anon, authenticated;
grant execute on function changer_ligne(uuid, statut_ligne, statut_ligne, integer, source_prix, uuid) to service_role;
grant execute on function enregistrer_alertes(uuid, jsonb) to service_role;
grant execute on function envoyer_proposition(uuid, uuid) to service_role;
