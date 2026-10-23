/**
 * Dépôt de l'abandon en mémoire, pour les tests. Même contrat que la fonction SQL abandonner_dossier : refus si la
 * proposition n'est plus sans_reponse ou si le dossier n'est plus en_proposition ; sinon le dossier passe à abandonnee.
 */
import type { AbandonRepository, PropositionAAbandonner } from '../../ports/abandon';
import { StatutModifieErreur } from '../../ports/statuts';

export class AbandonEnMemoire implements AbandonRepository {
  readonly propositions = new Map<string, PropositionAAbandonner>();
  readonly journal: string[] = [];

  async lire(propositionId: string) {
    const p = this.propositions.get(propositionId);
    return p ? { ...p } : null;
  }

  async abandonner(propositionId: string, conseillerId: string) {
    const p = this.propositions.get(propositionId);
    if (!p) throw new Error(`proposition introuvable : ${propositionId}`);
    if (p.statut !== 'sans_reponse') throw new StatutModifieErreur('sans_reponse', p.statut);
    if (p.dossier_statut !== 'en_proposition') throw new StatutModifieErreur('en_proposition', p.dossier_statut);
    p.dossier_statut = 'abandonnee';
    this.journal.push(`${propositionId}:en_proposition>abandonnee par ${conseillerId}`);
  }
}
