/**
 * Dossiers et fiches vus par le conseiller (E2.1). Lecture au format du dashboard (types/dashboard.ts) ;
 * écriture limitée aux champs du conseiller (fonction SQL corriger_fiche).
 */
import type { DetailDossier, ListeDossiers } from '../../types/dashboard';
import type { CorrectionFiche } from '../../types/fiche';

export interface DossiersLecture {
  /** Du plus récent au plus ancien. */
  liste(page: { limit: number; offset: number }): Promise<ListeDossiers>;
  /** null si le dossier n'existe pas. */
  detail(dossierId: string): Promise<DetailDossier | null>;
}

export interface FichesRepository {
  /** Corrige la fiche de la version en cours de la demande. `sans_fiche` si elle n'a pas encore été générée. */
  corriger(dossierId: string, correction: CorrectionFiche): Promise<'ok' | 'sans_fiche'>;
}
