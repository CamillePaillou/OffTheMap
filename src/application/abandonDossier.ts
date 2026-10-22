/**
 * Abandonner un dossier sans réponse (E6.5). Spécification : docs/specs/abandon-sans-reponse.md.
 *
 * À J+14 après l'envoi d'une proposition restée sans réponse, l'abandon du dossier est proposé au conseiller (rappel
 * J+14, rappels.ts). Rien ne se fait sans lui : il coche une case de confirmation, puis le dossier passe de
 * en_proposition à abandonnee, journalisé à son nom. La proposition reste telle qu'elle a été envoyée.
 */
import { abandonPropose } from '../domain/rappels';
import { verifierTransition } from '../domain/transition';
import type { AbandonRepository } from '../ports/abandon';
import { StatutModifieErreur } from '../ports/statuts';

export type ResultatAbandon =
  | { ok: true }
  | { ok: false; raison: 'non_confirme' | 'introuvable' | 'transition_interdite' | 'trop_tot' | 'statut_modifie' };

export async function abandonnerDossier(
  repo: AbandonRepository,
  e: { propositionId: string; conseillerId: string; confirme: boolean },
  maintenant: Date = new Date(),
): Promise<ResultatAbandon> {
  // un clic clôt le dossier : le conseiller coche une case de confirmation (pas de fenêtre du navigateur)
  if (!e.confirme) return { ok: false, raison: 'non_confirme' };
  const p = await repo.lire(e.propositionId);
  if (!p) return { ok: false, raison: 'introuvable' };
  // la matrice fait foi : en_proposition → abandonnee (conseiller), depuis une proposition sans réponse
  if (p.statut !== 'sans_reponse'
    || !verifierTransition('dossier', p.dossier_statut, 'abandonnee', { type: 'conseiller', id: e.conseillerId }).ok) {
    return { ok: false, raison: 'transition_interdite' };
  }
  if (!abandonPropose(p, maintenant)) return { ok: false, raison: 'trop_tot' };
  try {
    await repo.abandonner(e.propositionId, e.conseillerId);
  } catch (err) {
    if (err instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    throw err;
  }
  return { ok: true };
}
