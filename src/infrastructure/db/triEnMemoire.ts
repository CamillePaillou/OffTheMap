/** Tri en mémoire, pour les tests. Même contrat que trier_dossier (E3.1) : statut, journal et décision ensemble. */
import type { DecisionTri, StatutDossier } from '../../../types/enums';
import { SansFicheErreur, type EcritureTri, type TriRepository } from '../../ports/tri';
import type { StatutsEnMemoire } from './statutsEnMemoire';

export class TriEnMemoire implements TriRepository {
  /** Décision de la fiche courante de chaque dossier ; un dossier absent n'a pas de fiche. */
  readonly fiches = new Map<string, { decision: DecisionTri | null }>();

  constructor(readonly statuts: StatutsEnMemoire) {}

  async lireStatut(dossierId: string) {
    return (this.statuts.dossiers.get(dossierId)?.statut ?? null) as StatutDossier | null;
  }

  async trier(e: EcritureTri) {
    const fiche = this.fiches.get(e.dossierId);
    if (!fiche) throw new SansFicheErreur(e.dossierId);
    await this.statuts.appliquerTransition({
      cible: 'dossier', id: e.dossierId, ancien: e.ancien, nouveau: e.decision,
      auteur: { type: 'conseiller', id: e.conseillerId }, detail: e.detail,
    });
    fiche.decision = e.decision;
  }
}
