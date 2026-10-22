/**
 * Modèle du chatbot avec OpenRouter (E1.3) : réponses rapides d'abord.
 * - Les questions que le modèle de règles comprend (une ville, un type, un mot-clé, une date, le prix, la réservation,
 *   les horaires…) sont traitées par lui, sans appel réseau : moins d'une seconde.
 * - Les autres vont au vrai modèle, avec un délai court. S'il échoue ou dépasse le budget du message, le modèle de
 *   règles termine la réponse avec le catalogue : le visiteur n'attend jamais une minute pour rien.
 * Une instance par message (créée par la route) : le choix et le budget valent pour toute la boucle d'outils.
 */
import { LlmError } from '../../ports/llm-client';
import type { ModeleAgent, ReponseChat, RequeteChat } from '../../ports/modele-agent';
import { comprendQuestion } from './faux-modele-chat';

export class ModeleHybride implements ModeleAgent {
  private choix: 'regles' | 'modele' | null = null;
  private readonly debut: number;

  constructor(
    private readonly regles: ModeleAgent,
    private readonly modele: ModeleAgent,
    private readonly budgetMs = 15_000,
    private readonly horloge: () => number = Date.now,
  ) {
    this.debut = horloge();
  }

  async appeler(requete: RequeteChat): Promise<ReponseChat> {
    if (this.choix === null) {
      const question = [...requete.messages].reverse().find((m) => m.role === 'user');
      const aujourdhui = /Aujourd’hui : (\d{4}-\d{2}-\d{2})/.exec(String(requete.messages[0]?.content))?.[1] ?? new Date().toISOString().slice(0, 10);
      this.choix = question && comprendQuestion(String(question.content), aujourdhui) ? 'regles' : 'modele';
    }
    if (this.choix === 'regles' || this.horloge() - this.debut > this.budgetMs) {
      this.choix = 'regles';
      return this.regles.appeler(requete);
    }
    try {
      return await this.modele.appeler(requete);
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      this.choix = 'regles'; // modèle en panne ou trop lent : les règles terminent ce message
      return this.regles.appeler(requete);
    }
  }
}
