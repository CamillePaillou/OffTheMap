/**
 * Port des liens de correction (E1.2). L'adaptateur PostgreSQL appelle les fonctions SQL demander_correction,
 * lire_correction et corriger_demande (supabase/migrations/20261020120000_correction_demande.sql).
 * Le port ne voit jamais le jeton en clair : seulement son empreinte.
 */
import type { ChampCorrigeable, Commentaires } from '../../types/correction';
import type { NouvelleDemande } from '../../types/demande';

export type EtatLien = 'valide' | 'inconnu' | 'utilise' | 'expire' | 'clos';

export type VersionDemande = Omit<NouvelleDemande, 'consentement_rgpd' | 'consentement_ia'>;

export type LectureCorrection =
  | {
      etat: 'valide';
      champs: ChampCorrigeable[];
      motif: string;
      commentaires: Commentaires;
      boucle: number;
      expireLe: string;
      demande: VersionDemande;
    }
  | { etat: Exclude<EtatLien, 'valide'> };

export interface NouvelleCorrection {
  dossierId: string;
  champs: ChampCorrigeable[];
  motif: string;
  commentaires: Commentaires;
  jetonHash: string;
  conseillerId: string;
  expireLe: string;
}

/** Le dossier n'est pas au statut a_corriger. */
export class DossierPasACorrigerErreur extends Error {}
/** Deux corrections ont déjà été demandées pour ce dossier. */
export class BouclesEpuiseesErreur extends Error {}
/** Lien inconnu, déjà utilisé, expiré, ou dossier qui n'attend plus de correction. */
export class LienInvalideErreur extends Error {}

export interface CorrectionsRepository {
  demander(c: NouvelleCorrection): Promise<{ correctionId: string; boucle: number }>;
  lire(jetonHash: string): Promise<LectureCorrection>;
  corriger(jetonHash: string, demande: NouvelleDemande): Promise<{ demandeId: string; version: number; dossierId: string }>;
  /** Corrections déjà demandées pour le dossier, et fin de validité du lien encore ouvert s'il y en a un (E3.1). */
  boucles(dossierId: string): Promise<{ faites: number; lienOuvertJusquau: string | null }>;
}
