-- Prestations souhaitées (E1.4) : la demande ne garde que des prestations actives du catalogue, sans doublon, dans
-- l'ordre du client, 6 au plus ; sans le champ, la liste est vide. Transaction annulée : la base ne change pas.
\set ON_ERROR_STOP on
\o /dev/null
begin;
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite) values
  ('activite-lille-01', 'activite', 'Fabrique de gaufres', 'Lille', 2700, 10),
  ('hotel-lille-01', 'hebergement', 'Hôtel du Beffroi', 'Lille', 7900, 8)
  on conflict (id) do nothing;
insert into prestations (id, type, nom, destination, prix_unitaire_cents, capacite, actif) values
  ('activite-retiree-01', 'activite', 'Atelier retiré', 'Lille', 1000, 10, false)
  on conflict (id) do update set actif = false;

select demande_id as avec from deposer_demande($${
  "consentement_rgpd": true, "consentement_ia": true, "nom": "Essai", "email": "essai@example.org", "destination": "Lille",
  "date_debut": "2026-11-14", "date_fin": "2026-11-15", "nb_nuits": 1, "voyageurs": ["adulte"],
  "prestations_souhaitees": ["activite-lille-01", "inconnue-99", "activite-retiree-01", "hotel-lille-01", "activite-lille-01"]
}$$::jsonb) \gset
select demande_id as sans from deposer_demande($${
  "consentement_rgpd": true, "consentement_ia": true, "nom": "Essai", "email": "essai@example.org", "destination": null,
  "date_debut": "2026-11-14", "date_fin": "2026-11-15", "nb_nuits": 1, "voyageurs": ["adulte"]
}$$::jsonb) \gset
select set_config('essai.avec', :'avec', true), set_config('essai.sans', :'sans', true);

do $$
declare
  v_avec text[] := (select prestations_souhaitees from demandes where id = current_setting('essai.avec')::uuid);
  v_sans text[] := (select prestations_souhaitees from demandes where id = current_setting('essai.sans')::uuid);
begin
  if v_avec is distinct from array['activite-lille-01', 'hotel-lille-01'] then
    raise exception 'ÉCHEC : prestations gardées % (attendu : actives, sans doublon, dans l''ordre)', v_avec;
  end if;
  if v_sans is distinct from '{}'::text[] then raise exception 'ÉCHEC : sans le champ, % au lieu d''une liste vide', v_sans; end if;
end $$;

\o
\echo 'PRESTATIONS SOUHAITÉES OK : catalogue actif seulement, sans doublon, dans l''ordre ; liste vide par défaut.'
rollback;
