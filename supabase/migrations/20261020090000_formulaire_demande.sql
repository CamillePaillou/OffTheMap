-- Formulaire de demande (E1.1).
--
-- 1. Le formulaire ne garde que des champs utilisés : les colonnes sans usage sont retirées de demandes.
--    tel (le conseiller écrit par e-mail), dates_flexibles (le simulateur raisonne à une date), budget_ferme
--    (les alertes de budget n'en tiennent pas compte), niveau_physique (déduit des envies dans la fiche),
--    regime_precision et sante_precision (données de santé que rien n'exploite : minimisation RGPD).
-- 2. Les voyageurs sont saisis en adultes et enfants : la tranche « enfant » rejoint tranche_age.
--    Les enfants paient le prix adulte (docs/specs/chiffrage.md) ; la fiche sait que le groupe compte des enfants.
-- 3. deposer_demande crée le dossier au statut nouvelle, la version 1 de la demande et la première ligne du journal,
--    dans la même transaction. Seul le serveur (service_role) peut l'appeler.
alter type tranche_age add value if not exists 'enfant';

alter table demandes
  drop column tel,
  drop column dates_flexibles,
  drop column budget_ferme,
  drop column niveau_physique,
  drop column regime_precision,
  drop column sante_precision;

create function deposer_demande(p_demande jsonb)
returns table (dossier_id uuid, demande_id uuid)
language plpgsql set search_path = public as $$
declare
  v_dossier uuid;
  v_demande uuid;
begin
  insert into dossiers (statut) values ('nouvelle') returning id into v_dossier;

  insert into demandes (
    dossier_id, version, consentement_rgpd, consentement_ia, nom, email, destination,
    date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, regimes, mobilite
  ) values (
    v_dossier, 1,
    coalesce((p_demande ->> 'consentement_rgpd')::boolean, false),
    coalesce((p_demande ->> 'consentement_ia')::boolean, false),
    p_demande ->> 'nom', p_demande ->> 'email', p_demande ->> 'destination',
    (p_demande ->> 'date_debut')::date, (p_demande ->> 'date_fin')::date,
    (p_demande ->> 'nb_nuits')::integer,
    array(select jsonb_array_elements_text(p_demande -> 'voyageurs'))::tranche_age[],
    (p_demande ->> 'budget_annonce_cents')::integer,
    p_demande ->> 'envies', p_demande ->> 'contraintes',
    array(select jsonb_array_elements_text(coalesce(p_demande -> 'regimes', '[]'::jsonb)))::regime[],
    (p_demande ->> 'mobilite')::mobilite
  ) returning id into v_demande;

  insert into historique_dossier (dossier_id, type, ancien_statut, nouveau_statut, auteur, detail)
    values (v_dossier, 'statut', null, 'nouvelle', 'systeme',
            jsonb_build_object('type', 'statut', 'cible', 'dossier', 'ancien', null, 'nouveau', 'nouvelle'));

  return query select v_dossier, v_demande;
end $$;

revoke execute on function deposer_demande(jsonb) from public, anon, authenticated;
grant execute on function deposer_demande(jsonb) to service_role;
