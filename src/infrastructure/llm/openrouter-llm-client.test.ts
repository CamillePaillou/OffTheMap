import { describe, expect, it } from 'vitest';
import { OUTIL_VERIFIER_DISPONIBILITE, versDemandePourLLM } from '../../../types';
import type { DemandeLue } from '../../../types';
import { lireConfigOpenRouter, OpenRouterLlmClient } from './openrouter-llm-client';
import type { ConfigOpenRouter } from './openrouter-llm-client';

const demande = versDemandePourLLM({
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
} satisfies DemandeLue);

const fiche = { envies: ['week-end créatif'], contraintes: ['pas de longues marches'], regimes: ['vegetarien'], mobilite: 'reduite', niveau_physique: null, points_flous: [] };

const reponseOutil = (name: string, args: unknown) => ({
  choices: [{ message: { content: null, tool_calls: [{ id: 'appel-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
});

type Reponse = { status: number; corps?: unknown } | 'delai';

/** Faux `fetch` : rejoue une réponse par appel et garde les requêtes envoyées. */
function fauxFetch(...reponses: Reponse[]) {
  const requetes: { modele: string; corps: Record<string, unknown>; entetes: Record<string, string> }[] = [];
  const f = (async (_url: string, init: RequestInit) => {
    const corps = JSON.parse(init.body as string);
    requetes.push({ modele: corps.model, corps, entetes: init.headers as Record<string, string> });
    const r = reponses.shift();
    if (!r) throw new Error('aucune réponse prévue');
    if (r === 'delai') throw new DOMException('délai', 'TimeoutError');
    return new Response(JSON.stringify(r.corps ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, requetes };
}

const client = (f: typeof fetch, modeles = ['principal/modele:free', 'reserve/modele:free']) =>
  new OpenRouterLlmClient({ cle: 'cle-de-test', modeles, delaiMs: 1000, fetch: f } satisfies ConfigOpenRouter);

describe('configuration OpenRouter', () => {
  const base = { LLM_API_KEY: 'cle-de-test', LLM_MODEL: 'principal/modele:free' };

  it('lit le modèle principal, la réserve et le délai', () => {
    expect(lireConfigOpenRouter({ ...base, LLM_MODEL_RESERVE: 'reserve/modele:free', LLM_TIMEOUT_MS: '5000' }))
      .toEqual({ cle: 'cle-de-test', modeles: ['principal/modele:free', 'reserve/modele:free'], delaiMs: 5000 });
  });

  it('exige une clé et un modèle', () => {
    expect(() => lireConfigOpenRouter({ LLM_MODEL: 'a/b:free' })).toThrowError(/LLM_API_KEY/);
    expect(() => lireConfigOpenRouter({ LLM_API_KEY: 'k' })).toThrowError(/LLM_MODEL/);
  });

  it('refuse toute route payante, principale ou de réserve', () => {
    expect(() => lireConfigOpenRouter({ ...base, LLM_MODEL: 'openai/gpt-4o' })).toThrowError(/:free/);
    expect(() => lireConfigOpenRouter({ ...base, LLM_MODEL_RESERVE: 'openai/gpt-4o' })).toThrowError(/:free/);
  });
});

describe('adaptateur OpenRouter', () => {
  it('impose l’outil de sortie et rend une fiche validée', async () => {
    const { f, requetes } = fauxFetch({ status: 200, corps: reponseOutil('rendre_fiche', fiche) });
    await expect(client(f).genererFiche(demande)).resolves.toEqual(fiche);

    const { corps, entetes } = requetes[0]!;
    expect(entetes.Authorization).toBe('Bearer cle-de-test');
    expect(corps.tool_choice).toEqual({ type: 'function', function: { name: 'rendre_fiche' } });
    expect(corps).not.toHaveProperty('models'); // pas de routage automatique d'OpenRouter vers un autre modèle
  });

  it('n’envoie rien de sensible', async () => {
    const { f, requetes } = fauxFetch({ status: 200, corps: reponseOutil('rendre_fiche', fiche) });
    await client(f).genererFiche(demande);
    const envoye = JSON.stringify(requetes[0]!.corps);
    for (const interdit of ['Sophie', 'Marchand', 'example.org', '0611223344', 'arachides', 'asthme']) {
      expect(envoye).not.toContain(interdit);
    }
  });

  it('refuse un brouillon hors des prestations autorisées', async () => {
    const brouillon = {
      programme: [{ date: '2026-11-07', titre: 'Jour 1', texte: 'Atelier.' }],
      lignes: [{ prestation_id: 'inconnue-99', date: '2026-11-07', participants: 2 }],
      ecartes: [],
    };
    const { f } = fauxFetch(
      { status: 200, corps: reponseOutil('rendre_brouillon', brouillon) },
      { status: 200, corps: reponseOutil('rendre_brouillon', brouillon) },
    );
    const entree = {
      demande, fiche: fiche as never, participants: 2,
      prestationsAutorisees: [{ id: 'activite-nantes-01', nom: 'Atelier', type: 'activite' as const }],
    };
    await expect(client(f).genererBrouillon(entree)).rejects.toMatchObject({ code: 'reponse_invalide' });
  });

  it('rend « reponse_invalide » si le modèle répond en texte au lieu d’appeler l’outil, même après rappel', async () => {
    const texte = { status: 200, corps: { choices: [{ message: { content: 'Voici la fiche…' } }] } };
    const { f, requetes } = fauxFetch(texte, texte);
    await expect(client(f).genererFiche(demande)).rejects.toMatchObject({ code: 'reponse_invalide' });
    expect(requetes).toHaveLength(2);
  });

  it('E11.2 (A01, A03) : une fiche refusée par le schéma est renvoyée une fois au modèle avec les erreurs, qui la corrige', async () => {
    const malFormee = { envies: fiche.envies, constraintes: fiche.contraintes, mobilite: null, niveau_physique: null, points_flous: [] };
    const { f, requetes } = fauxFetch(
      { status: 200, corps: reponseOutil('rendre_fiche', malFormee) },
      { status: 200, corps: reponseOutil('rendre_fiche', fiche) },
    );
    await expect(client(f).genererFiche(demande)).resolves.toEqual(fiche);
    expect(requetes.map((r) => r.modele)).toEqual(['principal/modele:free', 'principal/modele:free']);
    const retour = (requetes[1]!.corps.messages as { role: string; tool_call_id?: string; content: string }[]).at(-1)!;
    expect(retour).toMatchObject({ role: 'tool', tool_call_id: 'appel-1' });
    expect(retour.content).toMatch(/contraintes/);
    expect(retour.content).toMatch(/regimes/);
  });

  it('E11.2 (A02) : une ligne datée hors du séjour du formulaire est refusée et renvoyée au modèle', async () => {
    const programme = [{ date: '2026-11-07', titre: 'Jour 1', texte: 'Atelier.' }];
    const hors = { programme, lignes: [{ prestation_id: 'activite-nantes-01', date: '2026-11-14', participants: 2 }], ecartes: [] };
    const bon = { programme, lignes: [{ prestation_id: 'activite-nantes-01', date: '2026-11-08', participants: 2 }], ecartes: [] };
    const { f, requetes } = fauxFetch(
      { status: 200, corps: reponseOutil('rendre_brouillon', hors) },
      { status: 200, corps: reponseOutil('rendre_brouillon', bon) },
    );
    const entree = { demande, fiche: fiche as never, participants: 2, prestationsAutorisees: [{ id: 'activite-nantes-01', nom: 'Atelier', type: 'activite' as const }] };
    await expect(client(f).genererBrouillon(entree)).resolves.toMatchObject({ lignes: [{ date: '2026-11-08' }] });
    const retour = (requetes[1]!.corps.messages as { content: string }[]).at(-1)!.content;
    expect(retour).toMatch(/hors du séjour \(2026-11-07 → 2026-11-09\)/);
  });

  it('bascule sur le modèle de réserve en cas de panne ou de délai', async () => {
    const { f, requetes } = fauxFetch({ status: 429 }, { status: 200, corps: reponseOutil('rendre_fiche', fiche) });
    await expect(client(f).genererFiche(demande)).resolves.toEqual(fiche);
    expect(requetes.map((r) => r.modele)).toEqual(['principal/modele:free', 'reserve/modele:free']);

    const d = fauxFetch('delai', 'delai');
    await expect(client(d.f).genererFiche(demande)).rejects.toMatchObject({ code: 'delai' });
    expect(d.requetes).toHaveLength(2);
  });

  it('ne bascule pas sur la réserve pour une réponse non conforme ni une clé refusée', async () => {
    const avecPrix = { status: 200, corps: reponseOutil('rendre_fiche', { ...fiche, envies: ['atelier à 35 €'] }) };
    const invalide = fauxFetch(avecPrix, avecPrix);
    await expect(client(invalide.f).genererFiche(demande)).rejects.toMatchObject({ code: 'reponse_invalide' });
    // une correction demandée au même modèle, jamais à la réserve
    expect(invalide.requetes.map((r) => r.modele)).toEqual(['principal/modele:free', 'principal/modele:free']);

    const cle = fauxFetch({ status: 401 });
    await expect(client(cle.f).genererFiche(demande)).rejects.toMatchObject({ code: 'configuration' });
    expect(cle.requetes).toHaveLength(1);
  });

  it('laisse le modèle choisir l’outil en mode agent et indique quel modèle a répondu', async () => {
    const args = { prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2 };
    const { f, requetes } = fauxFetch({ status: 200, corps: reponseOutil('verifier_disponibilite', args) });
    const r = await client(f).appeler({
      messages: [{ role: 'user', content: 'Vérifie activite-nantes-01 le 2026-11-07 pour 2.' }],
      tools: [OUTIL_VERIFIER_DISPONIBILITE],
    });
    expect(requetes[0]!.corps.tool_choice).toBe('auto');
    expect(r.modele).toBe('principal/modele:free');
    expect(JSON.parse(r.message.tool_calls![0]!.function.arguments)).toEqual(args);
  });
});
