import { LlmError } from '../../ports/llm-client';
import type { LlmClient } from '../../ports/llm-client';
import type { ModeleAgent } from '../../ports/modele-agent';
import { FauxLlmClient } from './fake-llm-client';
import { FauxModeleChat } from './faux-modele-chat';
import { ModeleHybride } from './modele-hybride';
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

/**
 * Modèle du chatbot (E1.3) selon `LLM_PROVIDER` : le modèle de règles par défaut ; avec OpenRouter, le modèle hybride
 * (règles d'abord, puis le modèle principal seul, sans réserve, avec `CHATBOT_TIMEOUT_MS`, 8 s par défaut).
 */
export function creerModeleChat(env: Record<string, string | undefined> = process.env): ModeleAgent {
  const fournisseur = env.LLM_PROVIDER?.trim() || 'fake';
  if (fournisseur === 'fake') {
    if (env.LLM_FAKE_ECHEC?.trim() === '1') return { appeler: async () => { throw new LlmError('erreur_fournisseur', 'échec simulé (LLM_FAKE_ECHEC=1)'); } };
    return new FauxModeleChat();
  }
  if (fournisseur === 'openrouter') {
    const config = lireConfigOpenRouter(env);
    const delaiMs = Number(env.CHATBOT_TIMEOUT_MS) || 8_000;
    return new ModeleHybride(new FauxModeleChat(), new OpenRouterLlmClient({ ...config, modeles: config.modeles.slice(0, 1), delaiMs }));
  }
  throw new LlmError('configuration', `LLM_PROVIDER « ${fournisseur} » inconnu (fake ou openrouter)`);
}

/**
 * Mode de l'agent de vérification (E11.3) selon `AGENT_MODE` : `reel` par défaut (OpenRouter), ou `rejeu` pour une
 * démonstration sans OpenRouter (réponses du modèle rejouées, simulateur appelé en direct). Toute autre valeur est
 * refusée, pour ne jamais passer en rejeu sans l'avoir demandé.
 */
export function modeAgent(env: Record<string, string | undefined> = process.env): 'reel' | 'rejeu' {
  const mode = env.AGENT_MODE?.trim() || 'reel';
  if (mode === 'reel' || mode === 'rejeu') return mode;
  throw new LlmError('configuration', `AGENT_MODE « ${mode} » inconnu (reel ou rejeu)`);
}
