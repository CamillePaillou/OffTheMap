/**
 * Générer la fiche automatiquement dès qu'une demande arrive (E2.2). Spécification : docs/specs/generation-fiche.md.
 *
 * - lancerGenerationFiche : appelé par le serveur juste après le dépôt (E1.1), sans webhook. Le dossier passe de
 *   nouvelle à fiche_en_cours par la fonction de transition : de deux appels simultanés, un seul gagne, donc
 *   une seule génération et une seule fiche.
 * - genererFiche : le dossier est déjà en fiche_en_cours (lancement ci-dessus, bouton « relancer », correction
 *   de la demande E1.2). Le modèle ne reçoit que DemandePourLLM : ni nom, ni e-mail. Sa réponse est validée par
 *   FicheIA. Un échec donne lieu à un seul nouvel essai ; s'il échoue encore, le dossier passe en erreur et le
 *   conseiller peut relancer.
 */
import { versDemandePourLLM } from '../../types/llm';
import { verifierTransition } from '../domain/transition';
import type { Generation, GenerationFicheRepository } from '../ports/generationFiche';
import { LlmError, type CodeErreurLlm, type LlmClient } from '../ports/llm-client';
import { StatutModifieErreur, type StatutsRepository } from '../ports/statuts';
import { changerStatut } from './changerStatut';

export const ESSAIS_MAX = 2; // un essai et un seul nouvel essai

export interface DependancesFiche {
  statuts: StatutsRepository;
  fiches: GenerationFicheRepository;
  llm: LlmClient;
  /** Nom du modèle noté sur la fiche (traçabilité). */
  modele: string;
}

export type ResultatGeneration =
  | { ok: true; statut: 'fiche_prete'; essais: number }
  | { ok: false; statut: 'erreur'; essais: number; erreur: string }
  | { ok: false; raison: 'deja_lancee' | 'introuvable' | 'statut_modifie' | 'sans_demande' | 'transition_interdite' };

/** Libellés gardés en base et montrés au conseiller : jamais le message brut, qui pourrait citer la réponse. */
const LIBELLES: Record<CodeErreurLlm | 'inattendue', string> = {
  delai: 'le modèle n’a pas répondu à temps',
  erreur_fournisseur: 'le fournisseur du modèle est indisponible',
  reponse_invalide: 'la réponse du modèle n’était pas conforme',
  configuration: 'le modèle n’est pas configuré',
  inattendue: 'erreur inattendue pendant la génération',
};
const libelle = (e: unknown) => LIBELLES[e instanceof LlmError ? e.code : 'inattendue'];

/** Après le dépôt : nouvelle → fiche_en_cours, puis génération. */
export async function lancerGenerationFiche(d: DependancesFiche, dossierId: string): Promise<ResultatGeneration> {
  const lancement = await changerStatut(d.statuts, { cible: 'dossier', id: dossierId, vers: 'fiche_en_cours', auteur: { type: 'systeme' } });
  if (!lancement.ok) {
    // un autre appel a déjà lancé la génération, ou le dossier a avancé : ne rien faire
    return { ok: false, raison: lancement.raison === 'introuvable' ? 'introuvable' : 'deja_lancee' };
  }
  return genererFiche(d, dossierId);
}

/** Le dossier est en fiche_en_cours : appelle le modèle (deux essais au plus) et termine la génération. */
export async function genererFiche(d: DependancesFiche, dossierId: string): Promise<ResultatGeneration> {
  for (const vers of ['fiche_prete', 'erreur'] as const) {
    if (!verifierTransition('dossier', 'fiche_en_cours', vers, { type: 'systeme' }).ok) return { ok: false, raison: 'transition_interdite' };
  }
  const demande = await d.fiches.lireDemandeCourante(dossierId);
  if (!demande) return { ok: false, raison: 'sans_demande' };
  const pourLlm = versDemandePourLLM(demande); // seule porte vers le modèle : ni nom ni e-mail

  let generation: Generation | null = null;
  let derniereErreur: unknown = null;
  let essais = 0;
  while (essais < ESSAIS_MAX && generation === null) {
    essais += 1;
    try {
      generation = await d.llm.genererFiche(pourLlm); // déjà validée par FicheIA dans l'adaptateur
    } catch (e) {
      derniereErreur = e;
      if (e instanceof LlmError && e.code === 'configuration') break; // un nouvel essai ne changerait rien
    }
  }
  const echec = generation === null;
  const aEcrire: Generation = generation ?? { erreur: libelle(derniereErreur) };

  try {
    await d.fiches.terminer(dossierId, d.modele, aEcrire);
  } catch (e) {
    if (e instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    throw e;
  }
  return echec ? { ok: false, statut: 'erreur', essais, erreur: libelle(derniereErreur) } : { ok: true, statut: 'fiche_prete', essais };
}
