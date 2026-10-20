/**
 * Trier une demande : validée, à corriger ou refusée (E3.1). Spécification : docs/specs/tri.md.
 *
 * - trierDossier : la décision du conseiller passe par la matrice des transitions (fiche_prete → validee | a_corriger |
 *   refusee ; a_corriger → validee | refusee), puis la fonction SQL trier_dossier écrit ensemble le statut, le journal
 *   (avec la décision) et fiches.decision.
 * - trierACorriger : « à corriger » sert à quelque chose seulement si le client reçoit le lien de correction (E1.2).
 *   Les points à revoir sont validés AVANT le tri ; après le tri, le lien est créé. S'il ne peut pas l'être,
 *   le dossier reste à corriger et le conseiller peut envoyer un lien depuis la fiche (envoyerLienCorrection).
 */
import { REGLES_CORRECTION, schemaDemandeCorrection } from '../../types/correction';
import type { DecisionTri } from '../../types/enums';
import { verifierTransition, type RefusTransition } from '../domain/transition';
import type { CorrectionsRepository } from '../ports/corrections';
import { StatutModifieErreur } from '../ports/statuts';
import { SansFicheErreur, type TriRepository } from '../ports/tri';
import { demanderCorrection, type ResultatDemandeCorrection } from './corrigerDemande';
import type { ErreursChamps } from './deposerDemande';

export type RefusTri = RefusTransition | 'introuvable' | 'statut_modifie' | 'sans_fiche';
export type ResultatTri = { ok: true } | { ok: false; raison: RefusTri };

export async function trierDossier(
  repo: TriRepository,
  entree: { dossierId: string; decision: DecisionTri; conseillerId: string },
): Promise<ResultatTri> {
  const ancien = await repo.lireStatut(entree.dossierId);
  if (ancien === null) return { ok: false, raison: 'introuvable' };
  const verdict = verifierTransition('dossier', ancien, entree.decision, { type: 'conseiller', id: entree.conseillerId });
  if (!verdict.ok) return { ok: false, raison: verdict.raison };
  // la décision figure dans le journal, quel que soit le statut de départ
  const detail = { type: 'statut' as const, cible: 'dossier' as const, ancien, nouveau: entree.decision, decision: entree.decision };
  try {
    await repo.trier({ dossierId: entree.dossierId, ancien, decision: entree.decision, conseillerId: entree.conseillerId, detail });
  } catch (e) {
    if (e instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    if (e instanceof SansFicheErreur) return { ok: false, raison: 'sans_fiche' };
    throw e;
  }
  return { ok: true };
}

export interface EntreeCorrection {
  dossierId: string;
  conseillerId: string;
  champs: unknown;
  motif: unknown;
  commentaires?: unknown;
}

export type ResultatACorriger =
  | Extract<ResultatDemandeCorrection, { ok: true }>
  | { ok: false; erreurs: ErreursChamps }
  | { ok: false; raison: RefusTri | 'boucles_epuisees' | 'lien_non_cree' };

/** Tri « à corriger » et lien de correction pour le client. */
export async function trierACorriger(
  tri: TriRepository,
  corrections: CorrectionsRepository,
  entree: EntreeCorrection,
  maintenant: Date = new Date(),
): Promise<ResultatACorriger> {
  const saisie = schemaDemandeCorrection.safeParse({ champs: entree.champs, motif: entree.motif, commentaires: entree.commentaires });
  if (!saisie.success) return { ok: false, erreurs: erreursDe(saisie.error.issues) };
  if ((await corrections.boucles(entree.dossierId)).faites >= REGLES_CORRECTION.bouclesMax) return { ok: false, raison: 'boucles_epuisees' };

  const r = await trierDossier(tri, { dossierId: entree.dossierId, decision: 'a_corriger', conseillerId: entree.conseillerId });
  if (!r.ok) return r;
  return envoyerLienCorrection(corrections, entree, maintenant);
}

/** Lien de correction pour un dossier déjà à corriger (premier envoi échoué, lien expiré, seconde boucle). */
export async function envoyerLienCorrection(
  corrections: CorrectionsRepository,
  entree: EntreeCorrection,
  maintenant: Date = new Date(),
): Promise<ResultatACorriger> {
  const lien = await demanderCorrection(corrections, entree, maintenant);
  if (lien.ok) return lien;
  if ('erreurs' in lien) return lien;
  return { ok: false, raison: lien.refus === 'boucles_epuisees' ? 'boucles_epuisees' : 'lien_non_cree' };
}

function erreursDe(issues: readonly { path: readonly PropertyKey[]; message: string }[]): ErreursChamps {
  const erreurs: ErreursChamps = {};
  for (const i of issues) erreurs[String(i.path[0] ?? 'formulaire')] ??= i.message;
  return erreurs;
}
