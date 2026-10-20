/**
 * Port LlmClient (E0.13) : la seule façon pour l'application de parler à un LLM.
 * Les cas d'usage dépendent de cette interface, jamais d'un fournisseur (OpenRouter, faux client…).
 *
 * Règles (plan, sections 5.3 et ADR-0007) :
 * - une demande n'entre qu'en `DemandePourLLM` (minimisation : ni nom, ni e-mail, ni précision de santé) ;
 * - chaque réponse est validée par un schéma de `types/ia.ts` AVANT d'être rendue ;
 * - une réponse non conforme lève `LlmError('reponse_invalide')`, jamais une valeur partielle.
 */
import type { BrouillonIA, DemandePourLLM, FicheIA, TypePrestation } from '../../types';

/** Prestation que le code a laissée passer (destination, capacité) : le LLM ne choisit que parmi elles. */
export interface PrestationAutorisee {
  id: string;
  nom: string;
  type: TypePrestation;
}

export interface EntreeBrouillon {
  demande: DemandePourLLM;
  fiche: FicheIA;
  prestationsAutorisees: readonly PrestationAutorisee[];
  /** Nombre de voyageurs : une ligne ne peut pas dépasser ce nombre. */
  participants: number;
}

export type CodeErreurLlm = 'delai' | 'erreur_fournisseur' | 'reponse_invalide' | 'configuration';

export class LlmError extends Error {
  constructor(public readonly code: CodeErreurLlm, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  /** Étape 2 : fiche structurée à partir de la demande minimisée. */
  genererFiche(demande: DemandePourLLM): Promise<FicheIA>;
  /** Étape 6 : brouillon de proposition, limité aux prestations autorisées. */
  genererBrouillon(entree: EntreeBrouillon): Promise<BrouillonIA>;
}
