/**
 * Port des tarifs et de l'envoi (E5.1). L'adaptateur PostgreSQL appelle les fonctions SQL changer_ligne,
 * enregistrer_alertes et envoyer_proposition (supabase/migrations/20261020190000_tarifs_envoi.sql).
 */
import type { Alerte, SourcePrix, StatutLigne, StatutProposition, StatutVerification } from '../../types';
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

/** La ligne a changé entre la lecture et l'écriture. */
export class LigneModifieeErreur extends Error {}
/** La proposition est envoyée (ou au-delà) : ses tarifs ne se modifient plus. */
export class PropositionFigeeErreur extends Error {}
/** La base a refusé l'envoi : ligne à vérifier ou indisponible, ou alerte bloquante. */
export class EnvoiRefuseErreur extends Error {}

export interface TarifsRepository {
  lireLigne(ligneId: string): Promise<LigneLue | null>;
  /** Écrit la ligne, recalcule le total et fait suivre le statut de la proposition. Renvoie ce statut. */
  changerLigne(c: ChangementLigne): Promise<StatutProposition>;
  /** Ce qu'il faut pour chiffrer (E4.2) la proposition telle qu'elle est en base, et son statut. */
  lireChiffrage(propositionId: string): Promise<(EntreeChiffrage & { statut: StatutProposition }) | null>;
  enregistrerAlertes(propositionId: string, alertes: Alerte[]): Promise<void>;
  /** prete → envoyee. Rejette EnvoiRefuseErreur ou StatutModifieErreur. */
  envoyer(propositionId: string, conseillerId: string): Promise<void>;
}
