import { LlmError } from '../../ports/llm-client';
import type { LlmClient } from '../../ports/llm-client';
import { FauxLlmClient } from './fake-llm-client';
import { lireConfigOpenRouter, OpenRouterLlmClient } from './openrouter-llm-client';

/** Choisit le client selon `LLM_PROVIDER`. Par défaut : le faux client, sans appel réseau. */
export function creerLlmClient(env: Record<string, string | undefined> = process.env): LlmClient {
  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  if (fournisseur === 'fake') return new FauxLlmClient();
  if (fournisseur === 'openrouter') return new OpenRouterLlmClient(lireConfigOpenRouter(env));
  throw new LlmError('configuration', `LLM_PROVIDER « ${fournisseur} » inconnu (fake ou openrouter)`);
}
