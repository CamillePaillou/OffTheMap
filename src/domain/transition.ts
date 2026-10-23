/**
 * Règle pure de la fonction de transition (E0.7, ADR-0008) : une transition est-elle permise, et que doit-on
 * écrire dans historique_dossier ? Aucune écriture ici ; le cas d'usage changerStatut s'en charge.
 * La matrice vient de types/transitions.ts (E0.8), seule source de vérité.
 */
import type { DetailEvenement, Evenement } from '../../types/historique';
import type { StatutDossier, StatutProposition } from '../../types/enums';
import { DECISIONS_TRI } from '../../types/enums';
import { MACHINES, trouverTransition, type Priorite, type Transition } from '../../types/transitions';

/** Ce qui a un statut journalisé dans historique_dossier (type « statut »). */
export type Cible = 'dossier' | 'proposition';
export type StatutDe<C extends Cible> = C extends 'dossier' ? StatutDossier : StatutProposition;
export type AuteurTransition = Evenement['auteur'];

/** Seules les transitions de ces priorités sont acceptées : should et could le seront à leur livraison. */
export const PRIORITES_LIVREES: readonly Priorite[] = ['must'];

export type RefusTransition =
  | 'transition_interdite' // absente de la matrice, ou faite par le mauvais auteur
  | 'transition_non_livree' // dans la matrice, mais d'une priorité pas encore livrée
  | 'auteur_non_identifie'; // conseiller sans identifiant

export type VerdictTransition<C extends Cible> =
  | { ok: true; transition: Transition<StatutDe<C>>; detail: DetailEvenement }
  | { ok: false; raison: RefusTransition };

export function verifierTransition<C extends Cible>(
  cible: C,
  de: StatutDe<C>,
  vers: StatutDe<C>,
  auteur: AuteurTransition,
  livrees: readonly Priorite[] = PRIORITES_LIVREES,
): VerdictTransition<C> {
  if (auteur.type === 'conseiller' && !auteur.id.trim()) return { ok: false, raison: 'auteur_non_identifie' };

  const transitions = MACHINES[cible].transitions as readonly Transition<StatutDe<C>>[];
  const transition = trouverTransition(transitions, de, vers, auteur.type);
  if (!transition) return { ok: false, raison: 'transition_interdite' };
  if (!livrees.includes(transition.priorite)) return { ok: false, raison: 'transition_non_livree' };

  return { ok: true, transition, detail: detailStatut(cible, de, vers) };
}

function detailStatut<C extends Cible>(cible: C, de: StatutDe<C>, vers: StatutDe<C>): DetailEvenement {
  if (cible === 'proposition') {
    return { type: 'statut', cible, ancien: de as StatutProposition, nouveau: vers as StatutProposition };
  }
  const nouveau = vers as StatutDossier;
  // le tri d'une fiche prête (E3.1) est une décision : on la garde dans le détail
  const decision = de === 'fiche_prete' ? DECISIONS_TRI.find((d) => d === nouveau) : undefined;
  return { type: 'statut', cible: 'dossier', ancien: de as StatutDossier, nouveau, ...(decision && { decision }) };
}
