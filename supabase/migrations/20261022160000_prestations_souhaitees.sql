-- Prestations souhaitées (E1.4) : ce que le client a ajouté à son week-end depuis le chatbot (activité, hôtel…),
-- enregistré avec la demande pour que le conseiller le voie sur le dossier et que le brouillon le privilégie.
-- Seuls des identifiants du catalogue actif sont gardés (6 au plus, dans l'ordre du client) : un identifiant
-- inconnu ou retiré est ignoré, jamais une erreur pour le client.

alter table demandes
  add column prestations_souhaitees text[] not null default '{}'
    check (cardinality(prestations_souhaitees) <= 6);

comment on column demandes.prestations_souhaitees is
  'Identifiants de prestations du catalogue ajoutées par le client depuis le chatbot (E1.4), 6 au plus, sans prix.';

-- même insertion pour le dépôt (E1.1) et la correction (E1.2) : la colonne y est ajoutée
create or replace function inserer_version_demande(p_dossier uuid, p_version integer, p_demande jsonb)
returns uuid
language plpgsql set search_path = public as $$
declare
  v_demande uuid;
begin
  insert into demandes (
    dossier_id, version, consentement_rgpd, consentement_ia, nom, email, destination,
    date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, regimes, mobilite,
    prestations_souhaitees
  ) values (
    p_dossier, p_version,
    coalesce((p_demande ->> 'consentement_rgpd')::boolean, false),
    coalesce((p_demande ->> 'consentement_ia')::boolean, false),
    p_demande ->> 'nom', p_demande ->> 'email', p_demande ->> 'destination',
    (p_demande ->> 'date_debut')::date, (p_demande ->> 'date_fin')::date,
    (p_demande ->> 'nb_nuits')::integer,
    array(select jsonb_array_elements_text(p_demande -> 'voyageurs'))::tranche_age[],
    (p_demande ->> 'budget_annonce_cents')::integer,
    p_demande ->> 'envies', p_demande ->> 'contraintes',
    array(select jsonb_array_elements_text(coalesce(p_demande -> 'regimes', '[]'::jsonb)))::regime[],
    (p_demande ->> 'mobilite')::mobilite,
    -- seulement des prestations actives du catalogue, sans doublon, dans l'ordre donné, 6 au plus
    array(
      select s.id from (
        select distinct on (x.id) x.id, x.rang
        from jsonb_array_elements_text(coalesce(p_demande -> 'prestations_souhaitees', '[]'::jsonb)) with ordinality as x(id, rang)
        join prestations p on p.id = x.id and p.actif
        order by x.id, x.rang
      ) s order by s.rang limit 6
    )
  ) returning id into v_demande;
  return v_demande;
end $$;

-- correction (E1.2) : la version à corriger montre aussi les prestations choisies, pour les garder
create or replace function lire_correction(p_jeton_hash text)
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  c corrections;
  v_statut statut_dossier;
  d demandes;
begin
  select * into c from corrections where jeton_hash = p_jeton_hash;
  if not found then return jsonb_build_object('etat', 'inconnu'); end if;
  if c.utilisee_le is not null then return jsonb_build_object('etat', 'utilise'); end if;
  if c.expire_le <= now() then return jsonb_build_object('etat', 'expire'); end if;

  select statut into v_statut from dossiers where id = c.dossier_id;
  select * into d from demandes where id = c.demande_id;
  if v_statut <> 'a_corriger' or d.remplacee_le is not null then
    return jsonb_build_object('etat', 'clos');
  end if;

  return jsonb_build_object(
    'etat', 'valide',
    'champs', to_jsonb(c.champs),
    'motif', c.motif,
    'commentaires', c.commentaires,
    'boucle', c.boucle,
    'expire_le', c.expire_le,
    'demande', jsonb_build_object(
      'nom', d.nom, 'email', d.email, 'destination', d.destination,
      'date_debut', d.date_debut, 'date_fin', d.date_fin, 'nb_nuits', d.nb_nuits,
      'voyageurs', to_jsonb(d.voyageurs), 'budget_annonce_cents', d.budget_annonce_cents,
      'envies', d.envies, 'contraintes', d.contraintes,
      'regimes', to_jsonb(d.regimes), 'mobilite', d.mobilite,
      'prestations_souhaitees', to_jsonb(d.prestations_souhaitees)
    )
  );
end $$;
