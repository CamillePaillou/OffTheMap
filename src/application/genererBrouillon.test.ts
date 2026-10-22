import { describe, expect, it } from 'vitest';
import { FauxLlmClient } from '../infrastructure/llm/fake-llm-client';
import { StatutsEnMemoire } from '../infrastructure/db/statutsEnMemoire';
import { prestationsAutorisees, type PrestationDuCatalogue } from '../domain/brouillon/prestationsAutorisees';
import { DemarrageRefuse, type ContexteBrouillon, type GenerationBrouillonRepository, type ResultatBrouillon } from '../ports/generationBrouillon';
import { LlmError } from '../ports/llm-client';
import { StatutModifieErreur } from '../ports/statuts';
import { demanderBrouillon, genererBrouillon, relancerBrouillon } from './genererBrouillon';

const CATALOGUE: PrestationDuCatalogue[] = [
  { id: 'train-nantes-01', type: 'transport', nom: 'Train vers Nantes', destination: 'Nantes', prix_unitaire_cents: 4800, capacite: 20, actif: true },
  { id: 'hotel-nantes-01', type: 'hebergement', nom: 'Hôtel des Machines', destination: 'Nantes', prix_unitaire_cents: 9600, capacite: 8, actif: true },
  { id: 'activite-nantes-01', type: 'activite', nom: 'Atelier de machines imaginaires', destination: 'Nantes', prix_unitaire_cents: 3500, capacite: 10, actif: true },
  { id: 'activite-nantes-02', type: 'activite', nom: 'Atelier fermé', destination: 'Nantes', prix_unitaire_cents: 2000, capacite: 10, actif: false },
  { id: 'hotel-lyon-01', type: 'hebergement', nom: 'Hôtel de Lyon', destination: 'Lyon', prix_unitaire_cents: 8000, capacite: 8, actif: true },
];

const contexte = (surcharge: Partial<ContexteBrouillon['demande']> = {}): ContexteBrouillon => ({
  demande: {
    nom: 'Sophie Martin', email: 'sophie@example.org', destination: 'Nantes', date_debut: '2026-11-06', date_fin: '2026-11-09', nb_nuits: 3,
    voyageurs: ['adulte', 'adulte'], budget_annonce_cents: 50000, envies: 'Atelier créatif', contraintes: null, regimes: ['vegetarien'], mobilite: null, prestations_souhaitees: [],
    ...surcharge,
  },
  fiche: {
    envies: ['atelier créatif'], contraintes: ['sans voiture'], regimes: ['vegetarien'], mobilite: null, niveau_physique: 'faible', points_flous: [],
    budget_reel_cents: 40000, date_debut_fixe: '2026-11-07', date_fin_fixe: '2026-11-08', nb_nuits_fixe: 1,
  },
  catalogue: CATALOGUE,
});

class BrouillonsEnMemoire implements GenerationBrouillonRepository {
  ecrit: ResultatBrouillon | null = null;
  constructor(private readonly ctx: ContexteBrouillon | null = contexte(), private readonly dejaTermine = false) {}
  async demarrer(dossierId: string) {
    if (dossierId === 'complet') throw new DemarrageRefuse('deja_une_proposition');
    return 'p1';
  }
  async lireContexte() {
    return this.ctx;
  }
  async terminer(_id: string, r: ResultatBrouillon) {
    if (this.dejaTermine) throw new StatutModifieErreur('brouillon_en_cours', null);
    this.ecrit = r;
    return 'erreur' in r ? ('erreur' as const) : ('a_verifier' as const);
  }
}

const BROUILLON = {
  programme: [
    { date: '2026-11-07', titre: 'Arrivée et atelier', texte: 'Train le matin, atelier l’après-midi, nuit à l’hôtel.' },
    { date: '2026-11-08', titre: 'Retour', texte: 'Matinée libre, retour en train.' },
  ],
  lignes: [
    { prestation_id: 'train-nantes-01', date: '2026-11-07', participants: 2 },
    { prestation_id: 'hotel-nantes-01', date: '2026-11-07', participants: 2 },
    { prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2 },
  ],
  ecartes: [],
};

describe('prestations laissées au modèle', () => {
  it('actives, à la destination (sans tenir compte des accents ni de la casse), assez grandes pour le groupe', () => {
    expect(prestationsAutorisees(CATALOGUE, ' nântes ', 2).map((p) => p.id)).toEqual(['train-nantes-01', 'hotel-nantes-01', 'activite-nantes-01']);
    expect(prestationsAutorisees(CATALOGUE, 'Nantes', 9).map((p) => p.id)).toEqual(['train-nantes-01', 'activite-nantes-01']);
  });

  it('sans destination : tout le catalogue actif et assez grand', () => {
    expect(prestationsAutorisees(CATALOGUE, null, 2).map((p) => p.id)).toContain('hotel-lyon-01');
  });
});

describe('obtenir un brouillon de proposition (E4.4)', () => {
  it('lignes à a_verifier au prix du catalogue, total et alertes calculés par le code', async () => {
    const brouillons = new BrouillonsEnMemoire();
    const r = await genererBrouillon({ brouillons, llm: new FauxLlmClient({ brouillonRepondu: BROUILLON }) }, 'p1');

    expect(r).toEqual({ ok: true, statut: 'a_verifier', essais: 1 });
    const ecrit = brouillons.ecrit as Extract<ResultatBrouillon, { lignes: unknown }>;
    expect(ecrit.lignes.map((l) => [l.prestation_id, l.prix_unitaire_catalogue_cents, l.participants])).toEqual([
      ['train-nantes-01', 4800, 2], ['hotel-nantes-01', 9600, 2], ['activite-nantes-01', 3500, 2],
    ]);
    expect(ecrit.total_cents).toBe((4800 + 9600 + 3500) * 2); // 35 800, exemple des règles de chiffrage
    expect(ecrit.alertes).toEqual([]); // 89,5 % du budget réel de 400 € : sous le seuil de 90 %
    expect(ecrit.programme).toEqual(BROUILLON.programme);
  });

  it('prestations souhaitées par le client (E1.4) : transmises au modèle, retenues en premier par le faux modèle', async () => {
    const brouillons = new BrouillonsEnMemoire(contexte({ prestations_souhaitees: ['activite-nantes-01'] }));
    const llm = new FauxLlmClient();
    await genererBrouillon({ brouillons, llm }, 'p1');
    expect(JSON.parse(llm.appels[0]!.charge).demande.prestations_souhaitees).toEqual(['activite-nantes-01']);
    const ecrit = brouillons.ecrit as Extract<ResultatBrouillon, { lignes: unknown }>;
    expect(ecrit.lignes[0]!.prestation_id).toBe('activite-nantes-01');
  });

  it('budget réel dépassé : alerte calculée par le code', async () => {
    const ctx = contexte();
    ctx.fiche.budget_reel_cents = 30000;
    const brouillons = new BrouillonsEnMemoire(ctx);
    await genererBrouillon({ brouillons, llm: new FauxLlmClient({ brouillonRepondu: BROUILLON }) }, 'p1');
    expect((brouillons.ecrit as Extract<ResultatBrouillon, { alertes: unknown }>).alertes.map((a) => a.code)).toEqual(['budget_depasse']);
  });

  it('le modèle ne reçoit ni nom, ni e-mail, ni prix, ni notes ; dates et budget de référence de la fiche', async () => {
    const llm = new FauxLlmClient({ brouillonRepondu: BROUILLON });
    await genererBrouillon({ brouillons: new BrouillonsEnMemoire(), llm }, 'p1');
    const charge = llm.appels[0]!.charge;
    expect(charge).not.toMatch(/Sophie|sophie@example\.org|prix|4800|9600|3500/);
    expect(JSON.parse(charge)).toMatchObject({
      demande: { date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_annonce_cents: 40000 },
      prestationsAutorisees: [{ id: 'train-nantes-01', nom: 'Train vers Nantes', type: 'transport' }, expect.anything(), expect.anything()],
      participants: 2,
    });
  });

  it('un échec du modèle : un nouvel essai, puis erreur avec un libellé sans message brut', async () => {
    const brouillons = new BrouillonsEnMemoire();
    const r = await genererBrouillon({ brouillons, llm: new FauxLlmClient({ echec: new LlmError('delai', 'timeout après 30 s') }) }, 'p1');
    expect(r).toEqual({ ok: false, statut: 'erreur', essais: 2, erreur: 'le modèle n’a pas répondu à temps' });
    expect(brouillons.ecrit).toEqual({ erreur: 'le modèle n’a pas répondu à temps' });
  });

  it('modèle non configuré : pas de nouvel essai', async () => {
    const r = await genererBrouillon({ brouillons: new BrouillonsEnMemoire(), llm: new FauxLlmClient({ echec: new LlmError('configuration', 'clé absente') }) }, 'p1');
    expect(r).toMatchObject({ ok: false, statut: 'erreur', essais: 1 });
  });

  it('une prestation hors de la liste fournie rend la réponse non conforme : aucune ligne écrite', async () => {
    const horsListe = { ...BROUILLON, lignes: [{ prestation_id: 'hotel-lyon-01', date: '2026-11-07', participants: 2 }] };
    const brouillons = new BrouillonsEnMemoire();
    const r = await genererBrouillon({ brouillons, llm: new FauxLlmClient({ brouillonRepondu: horsListe }) }, 'p1');
    expect(r).toMatchObject({ ok: false, statut: 'erreur', erreur: 'la réponse du modèle n’était pas conforme' });
    expect(brouillons.ecrit).not.toHaveProperty('lignes');
  });

  it('un montant dans le texte du programme est refusé', async () => {
    const avecMontant = { ...BROUILLON, programme: [{ date: '2026-11-07', titre: 'Arrivée', texte: 'Hôtel à 96 € la nuit.' }] };
    const r = await genererBrouillon({ brouillons: new BrouillonsEnMemoire(), llm: new FauxLlmClient({ brouillonRepondu: avecMontant }) }, 'p1');
    expect(r).toMatchObject({ ok: false, statut: 'erreur' });
  });

  it('aucune prestation à la destination : erreur, sans appeler le modèle', async () => {
    const llm = new FauxLlmClient();
    const r = await genererBrouillon({ brouillons: new BrouillonsEnMemoire(contexte({ destination: 'Tanzanie' })), llm }, 'p1');
    expect(r).toMatchObject({ ok: false, statut: 'erreur', essais: 0, erreur: 'aucune prestation du catalogue ne correspond à la destination et au groupe' });
    expect(llm.appels).toHaveLength(0);
  });

  it('proposition introuvable, ou déjà terminée par un autre appel', async () => {
    expect(await genererBrouillon({ brouillons: new BrouillonsEnMemoire(null), llm: new FauxLlmClient() }, 'p1')).toEqual({ ok: false, raison: 'introuvable' });
    expect(await genererBrouillon({ brouillons: new BrouillonsEnMemoire(contexte(), true), llm: new FauxLlmClient({ brouillonRepondu: BROUILLON }) }, 'p1'))
      .toEqual({ ok: false, raison: 'statut_modifie' });
  });
});

describe('demander et relancer un brouillon', () => {
  it('demande acceptée ou refusée', async () => {
    expect(await demanderBrouillon(new BrouillonsEnMemoire(), 'd1', 'c1')).toEqual({ ok: true, propositionId: 'p1' });
    expect(await demanderBrouillon(new BrouillonsEnMemoire(), 'complet', 'c1')).toEqual({ ok: false, raison: 'deja_une_proposition' });
  });

  it('relancer : erreur → brouillon_en_cours au nom du conseiller ; refusé depuis un autre statut', async () => {
    const statuts = new StatutsEnMemoire();
    statuts.propositions.set('p1', { statut: 'erreur', dossier_id: 'd1' });
    statuts.propositions.set('p2', { statut: 'a_verifier', dossier_id: 'd1' });
    expect(await relancerBrouillon(statuts, 'p1', 'c1')).toMatchObject({ ok: true, nouveau: 'brouillon_en_cours' });
    expect(await relancerBrouillon(statuts, 'p2', 'c1')).toEqual({ ok: false, raison: 'transition_interdite' });
  });
});
