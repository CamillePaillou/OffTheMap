-- Fiche d'un dossier (E2.1) : ce que le conseiller corrige et ce que la génération écrit ne se recouvrent jamais.
--
-- 1. corriger_fiche n'écrit que les champs du conseiller (budget réel, dates fixes, notes).
-- 2. enregistrer_generation_fiche n'écrit que les champs de l'IA (E2.2 l'appelle) : une régénération
--    remplace envies, contraintes, points flous… mais garde budget réel, dates fixes, notes, décision et validation.
-- Seul le serveur (service_role) peut les appeler : le conseiller passe par le cas d'usage, après exigerConseiller().

create function corriger_fiche(
  p_fiche_id uuid,
  p_budget_reel_cents integer,
  p_date_debut_fixe date,
  p_date_fin_fixe date,
  p_nb_nuits_fixe integer,
  p_notes_conseiller text
) returns void
language plpgsql set search_path = public as $$
begin
  update fiches set
    budget_reel_cents = p_budget_reel_cents,
    date_debut_fixe = p_date_debut_fixe,
    date_fin_fixe = p_date_fin_fixe,
    nb_nuits_fixe = p_nb_nuits_fixe,
    notes_conseiller = p_notes_conseiller
  where id = p_fiche_id;
  if not found then
    raise exception 'fiche introuvable : %', p_fiche_id using errcode = 'OT001';
  end if;
end $$;

-- p_generation : soit le JSON validé par FicheIA (envies, contraintes, points_flous, regimes, mobilite, niveau_physique),
-- soit {"erreur": "..."} après un échec. modele est toujours renseigné.
create function enregistrer_generation_fiche(p_demande_id uuid, p_modele text, p_generation jsonb)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_fiche uuid;
begin
  if p_generation ? 'erreur' then
    -- échec : la fiche précédente (s'il y en a une) garde son contenu, seule l'erreur est notée
    insert into fiches (demande_id, modele, erreur_generation)
      values (p_demande_id, p_modele, p_generation ->> 'erreur')
    on conflict (demande_id) do update set modele = excluded.modele, erreur_generation = excluded.erreur_generation
    returning id into v_fiche;
  else
    insert into fiches (demande_id, envies, contraintes, points_flous, regimes, mobilite, niveau_physique, modele, erreur_generation)
      values (
        p_demande_id,
        array(select jsonb_array_elements_text(coalesce(p_generation -> 'envies', '[]'))),
        array(select jsonb_array_elements_text(coalesce(p_generation -> 'contraintes', '[]'))),
        array(select jsonb_array_elements_text(coalesce(p_generation -> 'points_flous', '[]'))),
        array(select jsonb_array_elements_text(coalesce(p_generation -> 'regimes', '[]')))::regime[],
        (p_generation ->> 'mobilite')::mobilite,
        (p_generation ->> 'niveau_physique')::niveau_physique,
        p_modele, null
      )
    -- les champs du conseiller (budget_reel_cents, dates fixes, notes, decision, validation) ne sont pas listés : ils restent
    on conflict (demande_id) do update set
      envies = excluded.envies, contraintes = excluded.contraintes, points_flous = excluded.points_flous,
      regimes = excluded.regimes, mobilite = excluded.mobilite, niveau_physique = excluded.niveau_physique,
      modele = excluded.modele, erreur_generation = null
    returning id into v_fiche;
  end if;
  return v_fiche;
end $$;

revoke execute on function corriger_fiche(uuid, integer, date, date, integer, text) from public, anon, authenticated;
grant execute on function corriger_fiche(uuid, integer, date, date, integer, text) to service_role;
revoke execute on function enregistrer_generation_fiche(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function enregistrer_generation_fiche(uuid, text, jsonb) to service_role;
