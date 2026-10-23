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
  /** E7.4 : obligatoire après le dépôt, le client a accepté le changement. */
  accordClient?: boolean;
}

/** E7.4 : retrait d'une ligne indisponible après le dépôt, sans remplacement. */
export interface RetraitLigne {
  ligneId: string;
  conseillerId: string;
  accordClient: boolean;
}

/** Prestation du catalogue proposée pour remplacer une ligne. */
export interface PrestationRemplacante {
  id: string;
  nom: string;
  type: TypePrestation;
  prix_unitaire_cents: number;
  capacite: number;
}

/** Ajout d'une prestation à une proposition modifiable (E6.6). */
export interface AjoutLigne {
  propositionId: string;
  prestationId: string;
  date: string;
  participants: number;
  conseillerId: string;
  /** Hébergement seulement ; 1 par défaut. */
  nbNuits?: number;
}

/** Nouvelle date, nouveaux participants et/ou nouvelles nuits pour une ligne (E6.6). Absent : inchangé. */
export interface ModificationLigne {
  ligneId: string;
  conseillerId: string;
  date?: string;
  participants?: number;
  /** Hébergement seulement. */
  nbNuits?: number;
}

/** Séjour de référence de la proposition : dates fixes de la fiche (E2.1). */
export interface Sejour {
  date_debut: string;
  date_fin: string;
  nb_nuits: number;
}

/** Le séjour ajusté serait impossible : moins de zéro nuit, plus de 14, ou plus de nuits que de jours. */
export class SejourImpossibleErreur extends Error {}

/** La ligne a changé entre la lecture et l'écriture. */
export class LigneModifieeErreur extends Error {}
/** E7.4 : après le dépôt, remplacer ou retirer une ligne demande l'accord du client. */
export class AccordClientRequisErreur extends Error {}
/** E7.4 : la dernière prestation de la proposition ne se retire pas. */
export class DerniereLigneErreur extends Error {}
/** E7.4 : un accord ou une option est encore valable sur la ligne : elle ne se marque pas indisponible. */
export class DemarcheEnCoursLigneErreur extends Error {}
/** La proposition est envoyée (ou au-delà) : ses tarifs ne se modifient plus. */
export class PropositionFigeeErreur extends Error {}
/** La base a refusé l'envoi : ligne à vérifier ou indisponible, ou alerte bloquante. */
export class EnvoiRefuseErreur extends Error {}
/** La prestation de remplacement est inconnue ou retirée du catalogue. */
export class PrestationRefuseeErreur extends Error {}
/** Remplacement par la même prestation à la même date : rien ne changerait. */
export class MemePrestationErreur extends Error {}
/** Plusieurs nuits pour une prestation qui n'est pas un hébergement. */
export class NuitsRefuseesErreur extends Error {}

export interface TarifsRepository {
  lireLigne(ligneId: string): Promise<LigneLue | null>;
  /**
   * Écrit la ligne, recalcule le total et fait suivre le statut de la proposition. Renvoie ce statut.
   * Après le dépôt (E7.4) : seulement vers indisponible, ou à confirmé pour une remplaçante ; DemarcheEnCoursLigneErreur
   * si un accord ou une option est encore valable sur la ligne.
   */
  changerLigne(c: ChangementLigne): Promise<StatutProposition>;
  /** Ce qu'il faut pour chiffrer (E4.2) la proposition telle qu'elle est en base, et son statut. */
  lireChiffrage(propositionId: string): Promise<(EntreeChiffrage & { statut: StatutProposition; destination: string | null }) | null>;
  enregistrerAlertes(propositionId: string, alertes: Alerte[]): Promise<void>;
  /** prete → envoyee. Rejette EnvoiRefuseErreur ou StatutModifieErreur. */
  envoyer(propositionId: string, conseillerId: string): Promise<void>;
  /**
   * indisponible → remplacee, et nouvelle ligne « à vérifier » au prix du catalogue ; les autres lignes ne bougent pas.
   * Recalcule le total et fait suivre le statut de la proposition. Renvoie la nouvelle ligne et ce statut.
   * Après le dépôt (E7.4), seulement avec l'accord du client, et la proposition reste au dépôt reçu.
   * Rejette LigneModifieeErreur, PropositionFigeeErreur, PrestationRefuseeErreur, MemePrestationErreur ou
   * AccordClientRequisErreur.
   */
  remplacerLigne(r: RemplacementLigne): Promise<{ ligneId: string; statutProposition: StatutProposition }>;
  /**
   * E7.4 : indisponible → retiree, après le dépôt seulement ; le retrait est journalisé avec l'accord du client.
   * Rejette LigneModifieeErreur, PropositionFigeeErreur, AccordClientRequisErreur ou DerniereLigneErreur.
   */
  retirerLigne(r: RetraitLigne): Promise<StatutProposition>;
  /**
   * Prestations actives de la même destination que la ligne : la sienne d'abord (pour une autre date),
   * puis celles du même type, puis les autres, par nom.
   */
  prestationsRemplacantes(ligneId: string): Promise<PrestationRemplacante[]>;
  /**
   * E6.6 : nouvelle ligne « à vérifier » au prix du catalogue ; recalcule le total, fait suivre le statut.
   * Rejette PropositionFigeeErreur, PrestationRefuseeErreur ou MemePrestationErreur (déjà prévue à cette date).
   */
  ajouterLigne(a: AjoutLigne): Promise<{ ligneId: string; statutProposition: StatutProposition }>;
  /**
   * E6.6 : la ligne prend la nouvelle date et/ou les nouveaux participants et repasse « à vérifier », sans prix confirmé.
   * Rejette LigneModifieeErreur, PropositionFigeeErreur ou MemePrestationErreur (rien ne change, ou date déjà prévue).
   */
  modifierLigne(m: ModificationLigne): Promise<StatutProposition>;
  /** E6.6 : prestations actives de la destination de la proposition, pour l'ajout ; par type puis par nom. */
  prestationsAjoutables(propositionId: string): Promise<PrestationRemplacante[]>;
  /**
   * E6.6 : boutons « − » et « + » du séjour. Recule ou avance la date de retour d'un jour et ajoute ou retire une nuit,
   * dans les dates fixes de la fiche. Rejette PropositionFigeeErreur ou SejourImpossibleErreur.
   */
  ajusterNuitsSejour(propositionId: string, delta: -1 | 1, conseillerId: string): Promise<Sejour>;
  /** E6.6 : budget réel de la fiche (le client accepte de payer plus ou moins). Rejette PropositionFigeeErreur. */
  modifierBudgetReel(propositionId: string, budgetCents: number, conseillerId: string): Promise<void>;
}
