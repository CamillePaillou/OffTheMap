import { describe, expect, it } from 'vitest';
import { versProposition, versVerificationLigne, type PropositionBase, type VerificationBase } from './versPayloadsPropositions';

const ligne = (surcharge: Partial<PropositionBase['proposition_lignes'][number]> = {}): PropositionBase['proposition_lignes'][number] => ({
  id: 'a1e00000-0000-4000-8000-000009000001', date: '2026-11-07', participants: 2, nb_nuits: 1, prix_unitaire_catalogue_cents: 3500,
  prix_confirme_cents: null, source: null, confirme_le: null, statut: 'a_verifier', total_ligne_cents: 7000, cree_le: '2026-10-14T08:00:00+00:00',
  prestations: { id: 'activite-nantes-01', nom: 'Atelier de machines imaginaires', type: 'activite', capacite: 10, actif: true },
  profils: null,
  verifications: [],
  ...surcharge,
});

const proposition = (surcharge: Partial<PropositionBase> = {}): PropositionBase => ({
  id: 'b0b05100-0000-4000-8000-000009000000', dossier_id: 'd0551e00-0000-4000-8000-000009000000', version: 1, statut: 'a_verifier', programme: null,
  total_cents: 7000, alertes: [], ecarts: null, motif_changement: null,
  proposition_lignes: [ligne()],
  dossiers: { demandes: [{ version: 1, remplacee_le: null, budget_annonce_cents: 40000, fiches: { budget_reel_cents: null } }] },
  ...surcharge,
});

describe('propositions Supabase → payload du dashboard', () => {
  it('dernière vérification de chaque ligne, en UTC', () => {
    const p = versProposition(proposition({
      proposition_lignes: [ligne({
        verifications: [
          { statut: 'echec', prix_unitaire_cents: null, places_restantes: null, cree_le: '2026-10-14T11:00:00+00:00' },
          { statut: 'ok', prix_unitaire_cents: 4000, places_restantes: 6, cree_le: '2026-10-20T10:00:00+00:00' },
        ],
      })],
    }));
    expect(p.lignes[0]!.derniere_verification).toEqual({ statut: 'ok', prix_unitaire_cents: 4000, places_restantes: 6, le: '2026-10-20T10:00:00.000Z' });
  });

  it('lit une ligne retirée après le dépôt, sans prix confirmé (E7.4)', () => {
    const p = versProposition(proposition({ statut: 'depot_recu', proposition_lignes: [ligne({ statut: 'retiree' })] }));
    expect(p.lignes[0]!).toMatchObject({ statut: 'retiree', prix_confirme: null });
  });

  it('budget de référence : réel de la fiche, sinon annoncé', () => {
    expect(versProposition(proposition()).budget_reference_cents).toBe(40000);
    const avecReel = proposition({ dossiers: { demandes: [{ version: 1, remplacee_le: null, budget_annonce_cents: 40000, fiches: { budget_reel_cents: 38000 } }] } });
    expect(versProposition(avecReel).budget_reference_cents).toBe(38000);
  });

  it('prix confirmé avec sa source, sa date et son auteur', () => {
    const p = versProposition(proposition({
      proposition_lignes: [ligne({ prix_confirme_cents: 4000, source: 'agent', confirme_le: '2026-10-20T10:05:00+00:00', statut: 'confirme', total_ligne_cents: 8000, profils: { nom_affiche: 'Camille' } })],
    }));
    expect(p.lignes[0]!.prix_confirme).toEqual({ montant_cents: 4000, source: 'agent', le: '2026-10-20T10:05:00.000Z', par: 'Camille' });
  });

  it('lignes triées par date', () => {
    const p = versProposition(proposition({
      proposition_lignes: [ligne({ id: 'a1e00000-0000-4000-8000-000009000002', date: '2026-11-08' }), ligne()],
    }));
    expect(p.lignes.map((l) => l.date)).toEqual(['2026-11-07', '2026-11-08']);
  });
});

describe('vérification Supabase → VerificationLigne', () => {
  const base: VerificationBase = {
    id: 'e1e10000-0000-4000-8000-000009000001', ligne_id: 'a1e00000-0000-4000-8000-000009000001', statut: 'echec',
    prix_unitaire_cents: null, prix_total_cents: null, places_restantes: null, resume: null, reponse_serveur: null,
    trace: [{
      numero: 1, horodatage: '2026-10-14T12:59:57+02:00', appel: { nom: 'verifier_disponibilite', arguments: { prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2 } },
      conclusion: null, decision: { statut: 'accepte', raison: null, ecarts: [] }, http_statut: null, reponse_simulateur: { panne: 'delai' }, duree_ms: 5000,
    }],
    modele: 'modele-de-demo', nb_tours: 1, arret: 'echec_serveur', cree_le: '2026-10-14T11:00:00+00:00', profils: { nom_affiche: 'Camille (démo)' },
  };

  it('nom du conseiller qui l’a demandée, date en UTC', () => {
    expect(versVerificationLigne(base)).toMatchObject({ demandee_par: 'Camille (démo)', le: '2026-10-14T11:00:00.000Z', arret: 'echec_serveur' });
  });

  it('refuse une trace qui ne compte pas les tours', () => {
    expect(() => versVerificationLigne({ ...base, nb_tours: 2 })).toThrow();
  });
});
