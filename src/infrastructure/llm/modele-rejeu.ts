import { LlmError } from '../../ports/llm-client';
import type { ModeleAgent, ReponseChat } from '../../ports/modele-agent';
import { messagesDuModele, PREFIXE_REJEU, type EnregistrementAgent } from '../../domain/verification/rejeu';

/**
 * Modèle rejoué (E11.3) : rend, tour par tour, les messages enregistrés d'un vrai modèle, sans appel réseau.
 * Le nom rendu (« rejeu de minimax/…:free ») est enregistré dans `verifications.modele` : l'écran annonce le rejeu.
 */
export class ModeleRejeu implements ModeleAgent {
  private readonly file: ReponseChat['message'][];
  readonly nom: string;

  constructor(enregistrement: EnregistrementAgent) {
    this.file = messagesDuModele(enregistrement.trace);
    this.nom = `${PREFIXE_REJEU}${enregistrement.modele}`;
  }

  async appeler(): Promise<ReponseChat> {
    const message = this.file.shift();
    // l'enregistrement est épuisé : comme un modèle qui ne répond plus, la boucle s'arrête sur « non vérifié »
    if (!message) throw new LlmError('erreur_fournisseur', 'rejeu : plus de réponse enregistrée');
    return { modele: this.nom, message };
  }
}
