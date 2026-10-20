/**
 * Essai réel contre OpenRouter (E0.19) : ignoré par `npm test` et la CI.
 * Lancement : `make essai-llm` (lit LLM_API_KEY, LLM_MODEL et LLM_MODEL_RESERVE dans .env).
 * Chaque modèle configuré, principal puis réserve, est essayé seul.
 */
import { describe, expect, it } from 'vitest';
import { ArgsVerifierDisponibilite, OUTIL_VERIFIER_DISPONIBILITE, versDemandePourLLM } from '../../../types';
import { lireConfigOpenRouter, OpenRouterLlmClient } from './openrouter-llm-client';

const actif = process.env.LLM_ESSAI_REEL === '1';
const config = actif ? lireConfigOpenRouter(process.env) : null;

describe.skipIf(!actif)('OpenRouter, appel réel', () => {
  for (const modele of config?.modeles ?? []) {
    const llm = new OpenRouterLlmClient({ ...config!, modeles: [modele] });

    it(`${modele} appelle l’outil de vérification avec des arguments valides`, async () => {
      const r = await llm.appeler({
        messages: [
          { role: 'system', content: 'Tu vérifies une prestation en appelant l’outil fourni. Tu n’inventes aucun prix.' },
          { role: 'user', content: 'Vérifie la prestation activite-nantes-01 le 2026-11-07 pour 2 participants.' },
        ],
        tools: [OUTIL_VERIFIER_DISPONIBILITE],
      });
      const appel = r.message.tool_calls?.[0];
      expect(appel?.function.name).toBe('verifier_disponibilite');
      expect(ArgsVerifierDisponibilite.parse(JSON.parse(appel!.function.arguments))).toMatchObject({ participants: 2 });
    }, 60_000);

    it(`${modele} rend une fiche conforme`, async () => {
      const fiche = await llm.genererFiche(versDemandePourLLM({
        nom: 'Personne Test', email: 'test@example.org',
        destination: 'Nantes', date_debut: '2026-11-07', date_fin: '2026-11-09', nb_nuits: 2,
        voyageurs: ['adulte', 'adulte'], budget_annonce_cents: 40000,
        envies: 'Un week-end créatif sans voiture', contraintes: 'Pas de longues marches',
        regimes: ['vegetarien'], mobilite: 'reduite',
      }));
      expect(fiche.regimes).toEqual(['vegetarien']);
    }, 60_000);
  }
});
