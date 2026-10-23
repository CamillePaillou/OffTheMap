/**
 * Port d'écriture des demandes (E1.1). L'adaptateur PostgreSQL appelle la fonction SQL deposer_demande
 * (supabase/migrations/20261020090000_deposer_demande.sql) : dossier, demande et journal écrits ensemble, ou rien.
 */
import type { NouvelleDemande } from '../../types/demande';

export interface DemandeDeposee {
  dossierId: string;
  demandeId: string;
  /** Numéro de dossier donné au client (« DT-JADE-NANT ») pour suivre sa demande sans compte. */
  reference?: string;
}

export interface DemandesRepository {
  deposer(demande: NouvelleDemande): Promise<DemandeDeposee>;
}
