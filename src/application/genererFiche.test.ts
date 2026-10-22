import { beforeEach, describe, expect, it } from 'vitest';
import type { DemandeLue } from '../../types/llm';
import type { DemandePourLLM, FicheIA } from '../../types';
import { GenerationFicheEnMemoire } from '../infrastructure/db/generationFicheEnMemoire';
import { StatutsEnMemoire } from '../infrastructure/db/statutsEnMemoire';
import { FauxLlmClient } from '../infrastructure/llm/fake-llm-client';
import { creerLlmClient, nomModele } from '../infrastructure/llm';
import { LlmError, type EntreeBrouillon, type LlmClient } from '../ports/llm-client';
import { ESSAIS_MAX, genererFiche, lancerGenerationFiche, type DependancesFiche } from './genererFiche';
import { relancerFiche } from './relancerFiche';

const DOSSIER = 'd1';
const DEMANDE: DemandeLue = {
  nom: 'Inès Martin', email: 'ines@example.org', destination: 'Nantes',
  date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1,
  voyageurs: ['adulte', 'adulte'], budget_annonce_cents: 40000,
  envies: 'Un atelier créatif et la ville à pied', contraintes: 'Sans voiture',
  regimes: ['sans_gluten'], mobilite: null, prestations_souhaitees: [],
};

/** Client qui échoue les `n` premiers appels, puis répond comme le faux client. */
class ClientCapricieux implements LlmClient {
  appels = 0;
  private readonly reel = new FauxLlmClient();
  constructor(private readonly echecs: number, private readonly erreur = new LlmError('delai', 'pas de réponse')) {}
  async genererFiche(d: DemandePourLLM): Promise<FicheIA> {
    this.appels += 1;
    if (this.appels <= this.echecs) throw this.erreur;
    return this.reel.genererFiche(d);
  }
  genererBrouillon(e: EntreeBrouillon) {
    return this.reel.genererBrouillon(e);
  }
  resumerEcarts(e: Parameters<LlmClient['resumerEcarts']>[0]) {
    return this.reel.resumerEcarts(e);
  }
}

let statuts: StatutsEnMemoire;
let fiches: GenerationFicheEnMemoire;
const deps = (llm: LlmClient): DependancesFiche => ({ statuts, fiches, llm, modele: 'modele-de-test' });
const parcours = () => statuts.historique.map((h) => `${h.ancien_statut}>${h.nouveau_statut}`);

beforeEach(() => {
  statuts = new StatutsEnMemoire();
  statuts.dossiers.set(DOSSIER, { statut: 'nouvelle' });
  fiches = new GenerationFicheEnMemoire(statuts);
  fiches.demandes.set(DOSSIER, DEMANDE);
});

describe('générer la fiche dès qu’une demande arrive (E2.2)', () => {
  it('écrit une fiche validée et passe le dossier en fiche_prete, journal compris', async () => {
    const r = await lancerGenerationFiche(deps(new FauxLlmClient()), DOSSIER);
    expect(r).toEqual({ ok: true, statut: 'fiche_prete', essais: 1 });
    expect(statuts.dossiers.get(DOSSIER)!.statut).toBe('fiche_prete');
    expect(parcours()).toEqual(['nouvelle>fiche_en_cours', 'fiche_en_cours>fiche_prete']);
    expect(statuts.historique.every((h) => h.auteur === 'systeme')).toBe(true);
    expect(fiches.fiches.get(DOSSIER)).toMatchObject({ modele: 'modele-de-test', generation: { regimes: ['sans_gluten'] } });
  });

  it('ne transmet au modèle que la catégorie du régime, jamais le nom ni l’e-mail', async () => {
    const llm = new FauxLlmClient();
    await lancerGenerationFiche(deps(llm), DOSSIER);
    expect(llm.appels).toHaveLength(1);
    const charge = llm.appels[0]!.charge;
    expect(JSON.parse(charge).regimes).toEqual(['sans_gluten']);
    expect(charge).not.toContain('Inès');
    expect(charge).not.toContain('Martin');
    expect(charge).not.toContain('ines@example.org');
    expect(Object.keys(JSON.parse(charge))).not.toEqual(expect.arrayContaining(['nom']));
  });

  it('deux appels simultanés ne produisent qu’une génération et une fiche', async () => {
    const llm = new FauxLlmClient();
    const [a, b] = await Promise.all([lancerGenerationFiche(deps(llm), DOSSIER), lancerGenerationFiche(deps(llm), DOSSIER)]);
    expect([a, b]).toContainEqual({ ok: true, statut: 'fiche_prete', essais: 1 });
    expect([a, b]).toContainEqual({ ok: false, raison: 'deja_lancee' });
    expect(llm.appels).toHaveLength(1);
    expect(fiches.fiches.size).toBe(1);
    expect(parcours()).toEqual(['nouvelle>fiche_en_cours', 'fiche_en_cours>fiche_prete']);
  });

  it('ne relance rien sur un dossier déjà avancé', async () => {
    statuts.dossiers.set(DOSSIER, { statut: 'fiche_prete' });
    const llm = new FauxLlmClient();
    expect(await lancerGenerationFiche(deps(llm), DOSSIER)).toEqual({ ok: false, raison: 'deja_lancee' });
    expect(llm.appels).toHaveLength(0);
  });

  it('refait un essai après un échec, et réussit', async () => {
    const llm = new ClientCapricieux(1);
    expect(await lancerGenerationFiche(deps(llm), DOSSIER)).toEqual({ ok: true, statut: 'fiche_prete', essais: 2 });
    expect(llm.appels).toBe(2);
  });

  it('après deux échecs, passe en erreur avec un libellé, puis le conseiller peut relancer', async () => {
    const llm = new ClientCapricieux(ESSAIS_MAX);
    const r = await lancerGenerationFiche(deps(llm), DOSSIER);
    expect(r).toEqual({ ok: false, statut: 'erreur', essais: 2, erreur: 'le modèle n’a pas répondu à temps' });
    expect(llm.appels).toBe(2);
    expect(statuts.dossiers.get(DOSSIER)!.statut).toBe('erreur');
    expect(fiches.fiches.get(DOSSIER)!.generation).toEqual({ erreur: 'le modèle n’a pas répondu à temps' });

    // bouton « relancer » (E2.1) puis génération
    expect((await relancerFiche(statuts, DOSSIER, 'alice')).ok).toBe(true);
    expect(await genererFiche(deps(llm), DOSSIER)).toEqual({ ok: true, statut: 'fiche_prete', essais: 1 });
    expect(parcours()).toEqual(['nouvelle>fiche_en_cours', 'fiche_en_cours>erreur', 'erreur>fiche_en_cours', 'fiche_en_cours>fiche_prete']);
  });

  it('ne garde pas le message brut d’une réponse non conforme', async () => {
    const llm = new FauxLlmClient({ ficheRepondue: { envies: ['Budget de 400 €'], contraintes: [], regimes: [], mobilite: null, niveau_physique: null, points_flous: [] } });
    const r = await lancerGenerationFiche(deps(llm), DOSSIER);
    expect(r).toMatchObject({ ok: false, statut: 'erreur', essais: 2, erreur: 'la réponse du modèle n’était pas conforme' });
    expect(JSON.stringify(fiches.fiches.get(DOSSIER))).not.toContain('400');
  });

  it('ne refait pas d’essai si le modèle n’est pas configuré', async () => {
    const llm = new ClientCapricieux(5, new LlmError('configuration', 'LLM_API_KEY manquante'));
    expect(await lancerGenerationFiche(deps(llm), DOSSIER)).toMatchObject({ ok: false, statut: 'erreur', essais: 1 });
    expect(llm.appels).toBe(1);
  });

  it('n’écrit rien si le dossier a changé pendant la génération', async () => {
    const llm: LlmClient = {
      genererFiche: async (d) => {
        statuts.dossiers.set(DOSSIER, { statut: 'abandonnee' }); // quelqu'un est passé entre-temps
        return new FauxLlmClient().genererFiche(d);
      },
      genererBrouillon: async () => { throw new Error('non utilisé'); },
      resumerEcarts: async () => { throw new Error('non utilisé'); },
    };
    expect(await lancerGenerationFiche(deps(llm), DOSSIER)).toEqual({ ok: false, raison: 'statut_modifie' });
    expect(fiches.fiches.size).toBe(0);
  });

  it('signale un dossier sans demande', async () => {
    fiches.demandes.clear();
    expect(await lancerGenerationFiche(deps(new FauxLlmClient()), DOSSIER)).toEqual({ ok: false, raison: 'sans_demande' });
  });
});

describe('configuration du modèle pour la génération', () => {
  it('simule un échec du faux client avec LLM_FAKE_ECHEC=1', async () => {
    const llm = creerLlmClient({ LLM_PROVIDER: 'fake', LLM_FAKE_ECHEC: '1' });
    expect(await lancerGenerationFiche(deps(llm), DOSSIER)).toMatchObject({ ok: false, statut: 'erreur', essais: 2 });
  });
  it('note le modèle principal sur la fiche', () => {
    expect(nomModele({ LLM_PROVIDER: 'openrouter', LLM_MODEL: 'x/y:free' })).toBe('x/y:free');
    expect(nomModele({})).toBe('faux-client');
  });
});
