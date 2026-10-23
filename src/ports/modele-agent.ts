/**
 * Port ModeleAgent (E8.3) : un tour de conversation avec outils, pour la boucle de l'agent.
 * Format « chat completions » compatible OpenAI. La boucle dépend de cette interface, jamais d'OpenRouter.
 * Implémenté par `OpenRouterLlmClient` ; les tests de la boucle utilisent un faux modèle scripté.
 */

export interface AppelOutil {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type MessageChat =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: AppelOutil[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface DefinitionOutil {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export interface RequeteChat {
  messages: MessageChat[];
  tools: readonly DefinitionOutil[];
  /** Absent : le modèle choisit (boucle de l'agent). Un nom d'outil : réponse structurée imposée. */
  outilImpose?: string;
}

export interface ReponseChat {
  /** Modèle qui a répondu : à enregistrer dans `verifications.modele`. */
  modele: string;
  message: { content: string | null; tool_calls?: AppelOutil[] };
}

export interface ModeleAgent {
  /** Un tour. Lève `LlmError` (`delai`, `erreur_fournisseur`, `configuration`) si le fournisseur échoue. */
  appeler(requete: RequeteChat): Promise<ReponseChat>;
}
