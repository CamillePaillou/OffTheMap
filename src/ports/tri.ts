/**
 * Port du tri d'un dossier (E3.1). L'adaptateur PostgreSQL appelle la fonction SQL trier_dossier :
 * statut du dossier, journal et décision sur la fiche écrits ensemble, ou rien.
 */
import type { DetailEvenement } from '../../types/historique';
import type { DecisionTri, StatutDossier } from '../../types/enums';

export interface EcritureTri {
  dossierId: string;
  ancien: StatutDossier;
  decision: DecisionTri;
  conseillerId: string;
  detail: DetailEvenement;
}

/** Le dossier n'a pas de fiche pour sa version courante : rien n'est écrit. */
export class SansFicheErreur extends Error {}

export interface TriRepository {
  lireStatut(dossierId: string): Promise<StatutDossier | null>;
  /** Rejette StatutModifieErreur si le statut ne vaut plus `ancien`, SansFicheErreur s'il n'y a pas de fiche. */
  trier(e: EcritureTri): Promise<void>;
}
