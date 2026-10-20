/** Port de la réponse du client (E7.1). L'adaptateur appelle la fonction SQL enregistrer_reponse_client. */
import type { StatutProposition } from '../../types';

/** Une autre proposition du dossier est déjà acceptée (OT011). */
export class DejaAccepteeErreur extends Error {}

export interface ReponseClientRepository {
  lireStatut(propositionId: string): Promise<StatutProposition | null>;
  /** Rejette StatutModifieErreur (OT002) ou DejaAccepteeErreur (OT011). */
  enregistrer(propositionId: string, nouveau: 'acceptee' | 'depot_recu', conseillerId: string): Promise<void>;
}
