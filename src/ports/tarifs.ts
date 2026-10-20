/**
 * Port des tarifs et de l'envoi (E5.1) et du remplacement d'une ligne (E5.2). L'adaptateur PostgreSQL appelle
 * les fonctions SQL changer_ligne, enregistrer_alertes, envoyer_proposition
 * (supabase/migrations/20261020190000_tarifs_envoi.sql) et remplacer_ligne (20261020220000_remplacer_ligne.sql).
 */
import type { Alerte, SourcePrix, StatutLigne, StatutProposition, StatutVerification, TypePrestation } from '../../types';
import type { EntreeChiffrage } from '../domain/chiffrage/chiffrer';

export interface LigneLue {
  statut: StatutLigne;
  propositionId: string;
  /** Dernière vérification de l'agent, ou null. */
  verification: { statut: StatutVerification; prix_unitaire_cents: number | null } | null;
}

export interface ChangementLigne {
  ligneId: string;
  ancien: StatutLigne;
  nouveau: StatutLigne;
  /** Renseignés pour `confirme` seulement. */
  prixCents: number | null;
  source: SourcePrix | null;
  conseillerId: string;
}

/** Remplacement d'une ligne indisponible (E5.2). Date et participants : ceux de l'ancienne ligne s'ils sont absents. */
export interface RemplacementLigne {
  ligneId: string;
  prestationId: string;
  conseillerId: string;
  date?: string;
  participants?: number;
}

/** Prestation du catalogue proposée pour remplacer une ligne. */
export interface PrestationRemplacante {
  id: string;
  nom: string;
  type: TypePrestation;
  prix_unitaire_cents: number;
  capacite: number;
}

/** La ligne a changé entre la lecture et l'écriture. */
export class LigneModifieeErreur extends Error {}
/** La proposition est envoyée (ou au-delà) : ses tarifs ne se modifient plus. */
export class PropositionFigeeErreur extends Error {}
/** La base a refusé l'envoi : ligne à vérifier ou indisponible, ou alerte bloquante. */
export class EnvoiRefuseErreur extends Error {}
/** La prestation de remplacement est inconnue ou retirée du catalogue. */
export class PrestationRefuseeErreur extends Error {}
/** Remplacement par la même prestation à la même date : rien ne changerait. */
export class MemePrestationErreur extends Error {}

export interface TarifsRepository {
  lireLigne(ligneId: string): Promise<LigneLue | null>;
  /** Écrit la ligne, recalcule le total et fait suivre le statut de la proposition. Renvoie ce statut. */
  changerLigne(c: ChangementLigne): Promise<StatutProposition>;
  /** Ce qu'il faut pour chiffrer (E4.2) la proposition telle qu'elle est en base, et son statut. */
  lireChiffrage(propositionId: string): Promise<(EntreeChiffrage & { statut: StatutProposition }) | null>;
  enregistrerAlertes(propositionId: string, alertes: Alerte[]): Promise<void>;
  /** prete → envoyee. Rejette EnvoiRefuseErreur ou StatutModifieErreur. */
  envoyer(propositionId: string, conseillerId: string): Promise<void>;
  /**
   * indisponible → remplacee, et nouvelle ligne « à vérifier » au prix du catalogue ; les autres lignes ne bougent pas.
   * Recalcule le total et fait suivre le statut de la proposition. Renvoie la nouvelle ligne et ce statut.
   * Rejette LigneModifieeErreur, PropositionFigeeErreur, PrestationRefuseeErreur ou MemePrestationErreur.
   */
  remplacerLigne(r: RemplacementLigne): Promise<{ ligneId: string; statutProposition: StatutProposition }>;
  /**
   * Prestations actives de la même destination que la ligne : la sienne d'abord (pour une autre date),
   * puis celles du même type, puis les autres, par nom.
   */
  prestationsRemplacantes(ligneId: string): Promise<PrestationRemplacante[]>;
}
