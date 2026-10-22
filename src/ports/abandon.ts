/**
 * Port de l'abandon d'un dossier sans réponse (E6.5). L'adaptateur PostgreSQL appelle la fonction SQL abandonner_dossier :
 * en_proposition → abandonnee au nom du conseiller, statut et journal ensemble, ou rien.
 */
import type { StatutDossier, StatutProposition } from '../../types';

export interface PropositionAAbandonner {
  statut: StatutProposition;
  envoyee_le: string | null;
  dossier_statut: StatutDossier;
}

export interface AbandonRepository {
  /** La proposition et le statut de son dossier, ou null si elle n'existe pas. */
  lire(propositionId: string): Promise<PropositionAAbandonner | null>;
  /** Rejette StatutModifieErreur (OT002) si la proposition ou le dossier a changé entre-temps. */
  abandonner(propositionId: string, conseillerId: string): Promise<void>;
}
