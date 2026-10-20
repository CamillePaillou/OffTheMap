/**
 * Enregistrer l'acceptation du client puis le dépôt reçu (E7.1). Spécification : docs/specs/acceptation-depot.md.
 * Deux clics du conseiller : envoyee → acceptee, puis acceptee → depot_recu, chacun journalisé à son nom.
 * Le dossier sera « gagné » quand toutes les lignes seront réservées (transition du système, E9.5).
 */
import { TRANSITIONS_PROPOSITION, trouverTransition } from '../../types/transitions';
import { DejaAccepteeErreur, type ReponseClientRepository } from '../ports/reponseClient';
import { StatutModifieErreur } from '../ports/statuts';

export type Reponse = 'acceptee' | 'depot_recu';
export type ResultatReponse =
  | { ok: true }
  | { ok: false; raison: 'introuvable' | 'transition_interdite' | 'statut_modifie' | 'deja_acceptee' | 'non_confirme' };

export async function enregistrerReponse(
  repo: ReponseClientRepository,
  e: { propositionId: string; reponse: Reponse; conseillerId: string; confirme: boolean },
): Promise<ResultatReponse> {
  // un clic engage le dossier : le conseiller coche une case de confirmation (pas de fenêtre du navigateur)
  if (!e.confirme) return { ok: false, raison: 'non_confirme' };
  const ancien = await repo.lireStatut(e.propositionId);
  if (ancien === null) return { ok: false, raison: 'introuvable' };
  if (!e.conseillerId.trim() || !trouverTransition(TRANSITIONS_PROPOSITION, ancien, e.reponse, 'conseiller')) {
    return { ok: false, raison: 'transition_interdite' };
  }
  try {
    await repo.enregistrer(e.propositionId, e.reponse, e.conseillerId);
  } catch (err) {
    if (err instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    if (err instanceof DejaAccepteeErreur) return { ok: false, raison: 'deja_acceptee' };
    throw err;
  }
  return { ok: true };
}
