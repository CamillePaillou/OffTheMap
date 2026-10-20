import { LlmError } from '../../ports/llm-client';
import type { LlmClient } from '../../ports/llm-client';
import { FauxLlmClient } from './fake-llm-client';

/** Choisit le client selon `LLM_PROVIDER`. Par défaut : le faux client, sans appel payant. */
export function creerLlmClient(env: Record<string, string | undefined> = process.env): LlmClient {  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  if (fournisseur === 'fake') return new FauxLlmClient();
  // L'adaptateur OpenRouter arrive avec E0.19.
  throw new LlmError('configuration', `LLM_PROVIDER « ${fournisseur} » pas encore branché (voir E0.19)`);
}
