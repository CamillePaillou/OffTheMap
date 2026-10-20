/**
 * Lecture des propositions depuis les fixtures du dashboard (E0.12) : les écrans s'affichent sans la base.
 * L'adaptateur Supabase prendra le relais quand l'agent (E8.3) écrira de vraies vérifications.
 */
import { PROPOSITION, VERIFICATIONS } from '../../../fixtures/dashboard';
import type { PropositionsLecture } from '../../ports/propositions';

export class PropositionsFixtures implements PropositionsLecture {
  async proposition(id: string) {
    return id === PROPOSITION.id ? PROPOSITION : null;
  }

  async verificationDeLigne(ligneId: string) {
    const deLaLigne = VERIFICATIONS.filter((v) => v.ligne_id === ligneId);
    return deLaLigne.sort((a, b) => b.le.localeCompare(a.le))[0] ?? null;
  }
}

/** Identifiant de la proposition de démonstration, pour le lien depuis l'espace conseiller. */
export const PROPOSITION_DEMO_ID = PROPOSITION.id;
