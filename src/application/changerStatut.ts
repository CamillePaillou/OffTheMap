/**
 * Fonction de transition (E0.7, ADR-0008) : point de passage unique de tout changement de statut d'un dossier
 * ou d'une proposition. Une transition interdite est refusée sans rien écrire ; une transition acceptée écrit
 * le statut et une ligne de historique_dossier ensemble.
 *
 * Les gardes métier de la matrice (« fiche validée », « toutes les lignes réservées »…) restent à la charge du cas
 * d'usage appelant, qui les vérifie avant d'appeler changerStatut.
 */
import { verifierTransition, type AuteurTransition, type Cible, type RefusTransition, type StatutDe } from '../domain/transition';
import { StatutModifieErreur, type StatutsRepository } from '../ports/statuts';

export interface DemandeTransition<C extends Cible> {
  cible: C;
  id: string;
  vers: StatutDe<C>;
  auteur: AuteurTransition;
}

export type ResultatTransition<C extends Cible> =
  | { ok: true; ancien: StatutDe<C>; nouveau: StatutDe<C>; historiqueId: string }
  | { ok: false; raison: RefusTransition | 'introuvable' | 'statut_modifie' };

export async function changerStatut<C extends Cible>(
  repo: StatutsRepository,
  demande: DemandeTransition<C>,
): Promise<ResultatTransition<C>> {
  const { cible, id, vers, auteur } = demande;
  const ancien = await repo.lireStatut(cible, id);
  if (ancien === null) return { ok: false, raison: 'introuvable' };

  const verdict = verifierTransition(cible, ancien, vers, auteur);
  if (!verdict.ok) return verdict;

  try {
    const historiqueId = await repo.appliquerTransition({ cible, id, ancien, nouveau: vers, auteur, detail: verdict.detail });
    return { ok: true, ancien, nouveau: vers, historiqueId };
  } catch (e) {
    if (e instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    throw e;
  }
}
