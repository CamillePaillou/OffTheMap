/**
 * Port d'écriture des statuts (E0.7). L'adaptateur PostgreSQL appelle la fonction SQL changer_statut
 * (supabase/migrations/20261019130000_fonction_transition.sql), qui écrit statut et historique ensemble.
 */
import type { DetailEvenement } from '../../types/historique';
import type { AuteurTransition, Cible, StatutDe } from '../domain/transition';

export interface EcritureTransition<C extends Cible = Cible> {
  cible: C;
  id: string;
  ancien: StatutDe<C>;
  nouveau: StatutDe<C>;
  auteur: AuteurTransition;
  detail: DetailEvenement;
}

/** Levée quand le statut a changé entre la lecture et l'écriture (autre transition concurrente). */
export class StatutModifieErreur extends Error {
  constructor(public readonly attendu: string, public readonly trouve: string | null) {
    super(`statut modifié entre-temps : attendu ${attendu}, trouvé ${trouve}`);
  }
}

export interface StatutsRepository {
  /** Statut actuel, ou null si la ligne n'existe pas. */
  lireStatut<C extends Cible>(cible: C, id: string): Promise<StatutDe<C> | null>;
  /**
   * Écrit le nouveau statut et une ligne d'historique de façon atomique : les deux, ou rien.
   * Rejette StatutModifieErreur si le statut ne vaut plus `ancien`. Renvoie l'id de la ligne d'historique.
   */
  appliquerTransition<C extends Cible>(ecriture: EcritureTransition<C>): Promise<string>;
}
