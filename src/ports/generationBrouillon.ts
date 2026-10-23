/**
 * Port de la génération du brouillon de proposition (E4.4). L'adaptateur PostgreSQL démarre le brouillon par
 * demarrer_brouillon et le termine par terminer_brouillon : lignes, total, alertes et statuts écrits ensemble, ou rien.
 */
import type { Alerte } from '../../types';
import type { BrouillonIA, FicheIA } from '../../types/ia';
import type { DemandeLue } from '../../types/llm';
import type { PrestationDuCatalogue } from '../domain/brouillon/prestationsAutorisees';

export interface FicheValidee extends FicheIA {
  budget_reel_cents: number | null;
  destination_fixe: string | null;
  date_debut_fixe: string | null;
  date_fin_fixe: string | null;
  nb_nuits_fixe: number | null;
}

export interface ContexteBrouillon {
  demande: DemandeLue;
  fiche: FicheValidee;
  catalogue: PrestationDuCatalogue[];
}

export interface LigneBrouillon {
  id: string;
  prestation_id: string;
  date: string;
  participants: number;
  /** Hébergement : nuits depuis `date`, calculées par le code ; 1 pour les autres types. */
  nb_nuits: number;
  /** Copie figée du catalogue : le prix ne vient jamais du modèle. */
  prix_unitaire_catalogue_cents: number;
}

export type ResultatBrouillon =
  | { programme: BrouillonIA['programme']; lignes: LigneBrouillon[]; total_cents: number; alertes: Alerte[] }
  | { erreur: string };

/** Refus du démarrage, traduits des codes de demarrer_brouillon. */
export type RefusDemarrage = 'introuvable' | 'fiche_incomplete' | 'destination_manquante' | 'deja_une_proposition' | 'statut_modifie';

export class DemarrageRefuse extends Error {
  constructor(public readonly raison: RefusDemarrage) {
    super(`brouillon refusé : ${raison}`);
  }
}

export interface GenerationBrouillonRepository {
  /** Valide la fiche si besoin (entretien_fait → en_proposition) et crée la proposition en brouillon_en_cours. Rejette DemarrageRefuse. */
  demarrer(dossierId: string, conseillerId: string): Promise<string>;
  /** Demande courante, fiche et catalogue du dossier de la proposition ; null si la proposition n'existe pas. */
  lireContexte(propositionId: string): Promise<ContexteBrouillon | null>;
  /** Écrit le brouillon (ou l'échec). Rejette StatutModifieErreur si la proposition n'est plus en brouillon_en_cours. */
  terminer(propositionId: string, resultat: ResultatBrouillon): Promise<'a_verifier' | 'erreur'>;
}
