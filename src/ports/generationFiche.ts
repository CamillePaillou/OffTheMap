/**
 * Port de la génération de fiche (E2.2). L'adaptateur PostgreSQL lit la version courante de la demande et termine
 * la génération par la fonction SQL terminer_generation_fiche : fiche, statut et journal écrits ensemble, ou rien.
 */
import type { FicheIA } from '../../types/ia';
import type { DemandeLue } from '../../types/llm';

/** Une génération réussie (JSON validé par FicheIA) ou un échec, dont seul le libellé est gardé. */
export type Generation = FicheIA | { erreur: string };

export interface GenerationFicheRepository {
  /** Version courante (non remplacée) de la demande du dossier, ou null. */
  lireDemandeCourante(dossierId: string): Promise<DemandeLue | null>;
  /**
   * Écrit la fiche et passe le dossier de fiche_en_cours à fiche_prete (ou erreur).
   * Rejette StatutModifieErreur si le dossier n'est plus en fiche_en_cours.
   */
  terminer(dossierId: string, modele: string, generation: Generation): Promise<'fiche_prete' | 'erreur'>;
}
