import { describe, expect, it } from 'vitest';
import { etatFiche } from '../../domain/etatFiche';
import { versDetailDossier, versDossierResume, type LigneDossierDetail, type LigneDossierListe, type LigneHistorique } from './versPayloadsDashboard';

const ID = 'd0551e00-0000-4000-8000-000004000000';

const demandeListe = {
  version: 1, remplacee_le: null, nom: 'Nina Moreau', destination: 'Nantes', date_debut: '2026-11-07', date_fin: '2026-11-08',
  voyageurs: ['adulte', 'enfant'] as LigneDossierListe['demandes'][number]['voyageurs'], budget_annonce_cents: 15000,
  fiches: { erreur_generation: null, validee_le: null },
};

const ficheDetail: NonNullable<LigneDossierDetail['demandes'][number]['fiches']> = {
  envies: ['atelier créatif'], contraintes: ['sans voiture'], points_flous: [], regimes: ['vegetarien'], mobilite: null, niveau_physique: 'faible',
  budget_reel_cents: 38000, destination_fixe: null, date_debut_fixe: '2026-11-07', date_fin_fixe: null, nb_nuits_fixe: null, notes_conseiller: 'Rappeler mardi',
  decision: null, validee_le: null, erreur_generation: null,
};

const dossierDetail = (surcharge: Partial<LigneDossierDetail> = {}): LigneDossierDetail => ({
  id: ID, statut: 'fiche_prete', cree_le: '2026-10-12T07:00:00+00:00',
  demandes: [{
    version: 1, remplacee_le: null, nom: 'Nina Moreau', email: 'nina@example.org', destination: 'Nantes', date_debut: '2026-11-07',
    date_fin: '2026-11-08', nb_nuits: 1, voyageurs: ['adulte', 'adulte'], budget_annonce_cents: null, envies: 'Atelier', contraintes: null,
    prestations_souhaitees: ['hotel-nantes-01', 'retiree-01', 'activite-nantes-01'], fiches: ficheDetail,
  }],
  propositions: [],
  ...surcharge,
});

describe('prestations souhaitées (E1.4)', () => {
  it('nommées depuis le catalogue, dans l’ordre du client ; une prestation sortie du catalogue n’est pas montrée', () => {
    const catalogue = [
      { id: 'activite-nantes-01', nom: 'Atelier de machines imaginaires', type: 'activite' as const, destination: 'Nantes' },
      { id: 'hotel-nantes-01', nom: 'Hôtel des Machines', type: 'hebergement' as const, destination: 'Nantes' },
    ];
    const d = versDetailDossier(dossierDetail(), [], catalogue);
    expect(d.demande.prestations_souhaitees.map((p) => p.nom)).toEqual(['Hôtel des Machines', 'Atelier de machines imaginaires']);
    expect(versDetailDossier(dossierDetail(), []).demande.prestations_souhaitees).toEqual([]);
  });
});

describe('état de la fiche', () => {
  it.each([
    ['nouvelle', null, null],
    ['fiche_en_cours', null, 'en_cours'],
    ['erreur', null, 'erreur'],
    ['fiche_prete', { erreur_generation: null, validee_le: null }, 'prete'],
    ['en_proposition', { erreur_generation: null, validee_le: '2026-10-21T14:20:00Z' }, 'validee'],
    // une régénération en cours l'emporte sur la fiche précédente
    ['fiche_en_cours', { erreur_generation: null, validee_le: null }, 'en_cours'],
    ['validee', { erreur_generation: 'délai dépassé', validee_le: null }, 'erreur'],
  ] as const)('%s + %o → %s', (statut, fiche, attendu) => {
    expect(etatFiche(statut, fiche)).toBe(attendu);
  });
});

describe('lignes Supabase → payloads du dashboard', () => {
  it('résumé : client, voyageurs comptés, budget, état de la fiche, lignes à vérifier de la dernière proposition', () => {
    const r = versDossierResume({
      id: ID, statut: 'en_proposition', cree_le: '2026-10-12T07:00:00+00:00', demandes: [demandeListe],
      propositions: [
        { id: '5a1e0000-0000-4000-8000-000000000002', version: 1, statut: 'remplacee', total_cents: 30000, proposition_lignes: [] },
        { id: '5a1e0000-0000-4000-8000-000000000003', version: 2, statut: 'a_verifier', total_cents: null,
          proposition_lignes: [{ statut: 'a_verifier' }, { statut: 'confirme' }, { statut: 'a_verifier' }] },
      ],
    });
    expect(r).toMatchObject({
      cree_le: '2026-10-12T07:00:00.000Z',
      client: { nom: 'Nina Moreau' },
      demande: { voyageurs: 2, budget_annonce: { montant_cents: 15000 } },
      fiche: { etat: 'prete' },
      proposition: { version: 2, lignes_a_verifier: 2, total_cents: null },
    });
  });

  it('résumé : la version en cours de la demande, pas une version remplacée', () => {
    const r = versDossierResume({
      id: ID, statut: 'nouvelle', cree_le: '2026-10-12T07:00:00Z', propositions: [],
      demandes: [{ ...demandeListe, version: 2, nom: 'Nouvelle', fiches: null }, { ...demandeListe, version: 1, remplacee_le: '2026-10-13T00:00:00Z' }],
    });
    expect(r.client.nom).toBe('Nouvelle');
    expect(r.fiche).toBeNull();
  });

  it('détail : la correction du conseiller est exposée telle quelle', () => {
    const d = versDetailDossier(dossierDetail(), []);
    expect(d.fiche).toMatchObject({
      etat: 'prete', budget_reel_cents: 38000, dates_fixes: { debut: '2026-11-07', fin: null, nb_nuits: null }, notes_conseiller: 'Rappeler mardi',
    });
  });

  it('détail : fiche en erreur sans ligne dans fiches → fiche null, statut erreur (bouton « relancer »)', () => {
    const base = dossierDetail({ statut: 'erreur' });
    const d = versDetailDossier({ ...base, demandes: [{ ...base.demandes[0], fiches: null }] }, []);
    expect(d.statut).toBe('erreur');
    expect(d.fiche).toBeNull();
  });

  it('détail : historique avec la machine concernée et le nom du conseiller', () => {
    const historique: LigneHistorique[] = [
      { cree_le: '2026-10-12T07:00:00+00:00', type: 'statut', proposition_id: null, ancien_statut: null, nouveau_statut: 'nouvelle', auteur: 'systeme', profils: null },
      { cree_le: '2026-10-12T16:00:00+00:00', type: 'statut', proposition_id: null, ancien_statut: 'fiche_prete', nouveau_statut: 'validee', auteur: 'conseiller', profils: { nom_affiche: 'Camille' } },
      { cree_le: '2026-10-13T09:00:00+00:00', type: 'statut', proposition_id: '5a1e0000-0000-4000-8000-000000000002', ancien_statut: 'brouillon_en_cours', nouveau_statut: 'brouillon_pret', auteur: 'systeme', profils: null },
    ];
    const d = versDetailDossier(dossierDetail(), historique);
    expect(d.historique.map((h) => [h.cible, h.auteur_nom])).toEqual([['dossier', null], ['dossier', 'Camille'], ['proposition', null]]);
  });

  it('détail : un mail envoyé a un libellé lisible (E5.4)', () => {
    const historique: LigneHistorique[] = [
      { cree_le: '2026-10-12T17:00:00+00:00', type: 'mail', proposition_id: null, ancien_statut: null, nouveau_statut: null, auteur: 'conseiller',
        detail: { type: 'mail', modele: 'rendez_vous' }, profils: { nom_affiche: 'Camille' } },
    ];
    expect(versDetailDossier(dossierDetail(), historique).historique[0]).toMatchObject({ type: 'mail', resume: 'Mail « Rendez-vous » envoyé' });
  });
});
