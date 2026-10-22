import { LlmError } from '../../ports/llm-client';
import type { LlmClient } from '../../ports/llm-client';
import type { ModeleAgent } from '../../ports/modele-agent';
import { FauxLlmClient } from './fake-llm-client';
import { FauxModeleChat } from './faux-modele-chat';
import { lireConfigOpenRouter, OpenRouterLlmClient } from './openrouter-llm-client';

/** Choisit le client selon `LLM_PROVIDER`. Par défaut : le faux client, sans appel réseau. */
export function creerLlmClient(env: Record<string, string | undefined> = process.env): LlmClient {
  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  if (fournisseur === 'fake') {
    // échec simulé pour la démonstration du nouvel essai et du statut erreur (E2.2)
    if (env.LLM_FAKE_ECHEC?.trim() === '1') return new FauxLlmClient({ echec: new LlmError('erreur_fournisseur', 'échec simulé (LLM_FAKE_ECHEC=1)') });
    return new FauxLlmClient();
  }
  if (fournisseur === 'openrouter') return new OpenRouterLlmClient(lireConfigOpenRouter(env));
  throw new LlmError('configuration', `LLM_PROVIDER « ${fournisseur} » inconnu (fake ou openrouter)`);
}

/** Nom du modèle noté sur la fiche. Pour OpenRouter, le modèle principal : la réserve n'est pas distinguée. */
export function nomModele(env: Record<string, string | undefined> = process.env): string {
  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  return fournisseur === 'openrouter' ? (env.LLM_MODEL?.trim() || 'openrouter') : 'faux-client';
}

/** Modèle du chatbot (E1.3) selon `LLM_PROVIDER` : le faux modèle par défaut, OpenRouter (modèles gratuits) sinon. */
export function creerModeleChat(env: Record<string, string | undefined> = process.env): ModeleAgent {
  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  if (fournisseur === 'fake') {
    if (env.LLM_FAKE_ECHEC?.trim() === '1') return { appeler: async () => { throw new LlmError('erreur_fournisseur', 'échec simulé (LLM_FAKE_ECHEC=1)'); } };
    return new FauxModeleChat();
  }
  if (fournisseur === 'openrouter') return new OpenRouterLlmClient(lireConfigOpenRouter(env));
  throw new LlmError('configuration', `LLM_PROVIDER « ${fournisseur} » inconnu (fake ou openrouter)`);
}
