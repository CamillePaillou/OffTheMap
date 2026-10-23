/**
 * Bouton « relancer » d'une fiche en erreur (E2.1, ADR-0005) : le dossier repasse de erreur à fiche_en_cours,
 * au nom du conseiller, par la fonction de transition (statut et journal écrits ensemble).
 * La génération elle-même (E2.2) est lancée ensuite par l'action serveur (genererEnArrierePlan), après la réponse.
 */
import type { StatutsRepository } from '../ports/statuts';
import { changerStatut, type ResultatTransition } from './changerStatut';

export function relancerFiche(repo: StatutsRepository, dossierId: string, conseillerId: string): Promise<ResultatTransition<'dossier'>> {
  return changerStatut(repo, { cible: 'dossier', id: dossierId, vers: 'fiche_en_cours', auteur: { type: 'conseiller', id: conseillerId } });
}
