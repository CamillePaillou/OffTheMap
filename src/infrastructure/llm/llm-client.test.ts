import { describe, expect, it } from 'vitest';
import { versDemandePourLLM } from '../../../types';
import type { DemandeLue } from '../../../types';
import { LlmError } from '../../ports/llm-client';
import type { EntreeBrouillon } from '../../ports/llm-client';
import { FauxLlmClient } from './fake-llm-client';
import { creerLlmClient } from './index';
import { OpenRouterLlmClient } from './openrouter-llm-client';

const sophie: DemandeLue = {
  nom: 'Sophie Marchand',
  email: 'sophie.marchand@example.org',
  destination: 'Nantes',
  date_debut: '2026-11-07',
  date_fin: '2026-11-09',
  nb_nuits: 2,
  voyageurs: ['adulte', 'adulte'],
  budget_annonce_cents: 40000,
  envies: 'Un week-end créatif sans voiture',
  contraintes: 'Pas de longues marches',
  regimes: ['vegetarien'],
  mobilite: 'reduite', prestations_souhaitees: [],
};

const entree = (): EntreeBrouillon => ({
  demande: versDemandePourLLM(sophie),
  fiche: { envies: [], contraintes: [], regimes: ['vegetarien'], mobilite: 'reduite', niveau_physique: null, points_flous: [] },
  prestationsAutorisees: [
    { id: 'train-nantes-01', nom: 'Train', type: 'transport' },
    { id: 'activite-nantes-01', nom: 'Atelier', type: 'activite' },
  ],
  participants: 2,
});

describe('minimisation : rien de sensible ne part vers le LLM', () => {
  it('la fiche ne reçoit ni nom, ni e-mail, ni téléphone, ni précision de santé', async () => {
    const llm = new FauxLlmClient();
    await llm.genererFiche(versDemandePourLLM(sophie));
    const charge = llm.appels[0]!.charge;
    for (const interdit of ['Sophie', 'Marchand', 'example.org', '0611223344', 'arachides', 'asthme']) {
      expect(charge).not.toContain(interdit);
    }
    for (const champ of ['"nom"', '"email"', 'Sophie', 'sophie.marchand']) {
      expect(charge).not.toContain(champ);
    }
  });

  it('le brouillon ne reçoit rien de sensible non plus', async () => {
    const llm = new FauxLlmClient();
    await llm.genererBrouillon(entree());
    const charge = llm.appels[0]!.charge;
    for (const interdit of ['Sophie', 'example.org', '0611223344', 'arachides', 'asthme']) {
      expect(charge).not.toContain(interdit);
    }
  });

  it('une demande brute est refusée dès la compilation', async () => {
    const llm = new FauxLlmClient();
    // @ts-expect-error : seule une DemandePourLLM (issue de versDemandePourLLM) est acceptée
    await llm.genererFiche(sophie);
    expect(llm.appels).toHaveLength(1);
  });
});

describe('faux client', () => {
  it('rend une fiche conforme au contrat', async () => {
    const fiche = await new FauxLlmClient().genererFiche(versDemandePourLLM(sophie));
    expect(fiche.regimes).toEqual(['vegetarien']);
    expect(fiche).not.toHaveProperty('budget_annonce_cents');
  });

  it('rend un brouillon limité aux prestations autorisées', async () => {
    const b = await new FauxLlmClient().genererBrouillon(entree());
    expect(b.lignes.map((l) => l.prestation_id)).toEqual(['train-nantes-01', 'activite-nantes-01']);
    expect(b.lignes.every((l) => l.participants <= 2)).toBe(true);
  });

  it('refuse une prestation hors de la liste fournie', async () => {
    const llm = new FauxLlmClient({
      brouillonRepondu: {
        programme: [{ date: '2026-11-07', titre: 'Jour 1', texte: 'Texte.' }],
        lignes: [{ prestation_id: 'inconnue-99', date: '2026-11-07', participants: 2 }],
        ecartes: [],
      },
    });
    await expect(llm.genererBrouillon(entree())).rejects.toMatchObject({ code: 'reponse_invalide' });
  });

  it('refuse un montant dans le texte (réponse non conforme = erreur explicite)', async () => {
    const llm = new FauxLlmClient({
      ficheRepondue: { envies: ['atelier à 35 €'], contraintes: [], regimes: [], mobilite: null, niveau_physique: null, points_flous: [] },
    });
    await expect(llm.genererFiche(versDemandePourLLM(sophie))).rejects.toBeInstanceOf(LlmError);
  });

  it('simule une panne du fournisseur', async () => {
    const llm = new FauxLlmClient({ echec: new LlmError('delai', 'délai dépassé') });
    await expect(llm.genererFiche(versDemandePourLLM(sophie))).rejects.toMatchObject({ code: 'delai' });
  });
});

describe('creerLlmClient', () => {
  it('prend le faux client par défaut et avec LLM_PROVIDER=fake', () => {
    expect(creerLlmClient({})).toBeInstanceOf(FauxLlmClient);
    expect(creerLlmClient({ LLM_PROVIDER: 'fake' })).toBeInstanceOf(FauxLlmClient);
  });
  it('branche OpenRouter avec une clé et un modèle gratuit', () => {
    const env = { LLM_PROVIDER: 'openrouter', LLM_API_KEY: 'cle-de-test', LLM_MODEL: 'editeur/modele:free' };
    expect(creerLlmClient(env)).toBeInstanceOf(OpenRouterLlmClient);
  });
  it('refuse un fournisseur inconnu', () => {
    expect(() => creerLlmClient({ LLM_PROVIDER: 'anthropic' })).toThrowError(/inconnu/);
  });
});
