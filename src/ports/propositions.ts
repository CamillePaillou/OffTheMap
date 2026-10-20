/** Lecture d'une proposition et de la dernière vérification de chaque ligne (E8.4), au format du dashboard. */
import type { Proposition, VerificationLigne } from '../../types/dashboard';

export interface PropositionsLecture {
  /** null si la proposition n'existe pas. */
  proposition(id: string): Promise<Proposition | null>;
  /** Dernière vérification de la ligne, ou null si elle n'a jamais été vérifiée. */
  verificationDeLigne(ligneId: string): Promise<VerificationLigne | null>;
}
