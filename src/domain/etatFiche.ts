/**
 * État de la fiche affiché au conseiller (E2.1). La table fiches n'a pas de statut : l'état se déduit
 * du statut du dossier et des colonnes erreur_generation et validee_le (docs/specs/dashboard.md).
 */
import type { EtatFiche } from '../../types/dashboard';
import type { StatutDossier } from '../../types/enums';

export interface FicheEtat {
  erreur_generation: string | null;
  validee_le: string | null;
}

/** null : aucune fiche n'a encore été demandée (dossier nouvelle). */
export function etatFiche(statut: StatutDossier, fiche: FicheEtat | null): EtatFiche | null {
  // le statut du dossier dit ce qui se passe maintenant : une régénération en cours ou échouée l'emporte sur la fiche précédente
  if (statut === 'fiche_en_cours') return 'en_cours';
  if (statut === 'erreur') return 'erreur';
  if (!fiche) return null;
  if (fiche.erreur_generation !== null) return 'erreur';
  return fiche.validee_le !== null ? 'validee' : 'prete';
}
