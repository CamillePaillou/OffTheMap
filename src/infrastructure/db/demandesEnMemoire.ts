/** Dépôt des demandes en mémoire, pour les tests. Même contrat que deposer_demande : tout ou rien. */
import { randomUUID } from 'node:crypto';
import type { NouvelleDemande } from '../../../types/demande';
import type { DemandeDeposee, DemandesRepository } from '../../ports/demandes';

export class DemandesEnMemoire implements DemandesRepository {
  readonly dossiers = new Map<string, { statut: 'nouvelle' }>();
  readonly demandes = new Map<string, NouvelleDemande & { dossier_id: string; version: number }>();
  readonly historique: { dossier_id: string; ancien_statut: null; nouveau_statut: 'nouvelle'; auteur: 'systeme' }[] = [];

  async deposer(demande: NouvelleDemande): Promise<DemandeDeposee> {
    const dossierId = randomUUID();
    const demandeId = randomUUID();
    this.dossiers.set(dossierId, { statut: 'nouvelle' });
    this.demandes.set(demandeId, { ...demande, dossier_id: dossierId, version: 1 });
    this.historique.push({ dossier_id: dossierId, ancien_statut: null, nouveau_statut: 'nouvelle', auteur: 'systeme' });
    return { dossierId, demandeId };
  }
}
