/**
 * Port d'écriture de l'accord (E9.3). L'adaptateur PostgreSQL (accordsSupabase, E7.4) insère une ligne `options` au statut
 * `accord_donne` (retrouve lui-même la vérification de la ligne, `verification_id`) et l'événement
 * `accord` de l'historique dans la même transaction. L'index unique `options_une_en_cours_par_ligne`
 * garantit une seule démarche en cours par ligne.
 */
import type { SourcePrix } from '../../types/enums';

export interface NouvelAccord {
  dossier_id: string;
  proposition_id: string;
  ligne_id: string;
  accord_par: string; // id du conseiller
  accord_le: string;
  accord_expire_le: string;
  prix_accorde_cents: number; // prix TOTAL autorisé pour la ligne
  /** D'où vient ce prix : vérification de l'agent, ou tarif saisi par le conseiller (téléphone, mail, lien). */
  source_prix?: SourcePrix;
}

/** Levée quand une autre démarche en cours existe déjà sur la ligne (concurrence). */
export class DemarcheEnCoursErreur extends Error {
  constructor(public readonly ligneId: string) {
    super(`démarche déjà en cours sur la ligne ${ligneId}`);
  }
}

export interface AccordsRepository {
  /** Vrai si la ligne a déjà un accord ou une option en cours (statuts accord_donne ou posee). */
  demarcheEnCours(ligneId: string, maintenant: Date): Promise<boolean>;
  /** Écrit l'accord et son événement de journal ensemble. Rejette DemarcheEnCoursErreur. Renvoie l'id de l'option. */
  enregistrerAccord(accord: NouvelAccord): Promise<{ option_id: string }>;
  /**
   * Échec de pose, si c'est la dernière démarche de la ligne : raison et date. E11.2 (cas E02) : après
   * `reponse_serveur_incoherente`, un nouvel accord exige une vérification postérieure à cet échec.
   */
  dernierEchecPose(ligneId: string): Promise<{ raison: string; le: string } | undefined>;
  /** Lit l'accord non expiré de la ligne (affichage et préparation de la pose). */
  accordValable(ligneId: string, maintenant: Date): Promise<AccordOption | undefined> | AccordOption | undefined;
  /** Consomme atomiquement un accord non expiré, avant l'appel d'écriture externe. */
  consommerAccord(optionId: string, maintenant: Date): Promise<AccordOption | null>;
  /** Enregistre la réponse réelle ou l'échec du simulateur et l'événement correspondant. */
  terminerPoseOption(optionId: string, resultat: ResultatPoseOption): Promise<void>;
  /** Journalise aussi les tentatives refusées avant toute écriture externe. */
  tracerTentativeOption(evenement: TentativeOption): Promise<void>;
  /** Retrouve l'option posée pour la seconde validation humaine. */
  optionPosee(ligneId: string): Promise<AccordOptionEtOption | undefined> | AccordOptionEtOption | undefined;
  /** Enregistre le résultat de la confirmation, sans jamais conserver la clé d'approbation. */
  terminerConfirmation(optionId: string, resultat: ResultatConfirmation): Promise<void>;
  tracerTentativeConfirmation(evenement: TentativeConfirmation): Promise<void>;
  /** E9.8 : retrouve la réservation confirmée de la ligne (statut `confirmee`), pour l'annuler. */
  reservationConfirmee(ligneId: string): Promise<AccordOptionEtOption | undefined> | AccordOptionEtOption | undefined;
  /** E9.8 : enregistre la réponse du simulateur et journalise l'annulation au nom du conseiller, sans jamais conserver la clé. */
  terminerAnnulation(optionId: string, auteurId: string, resultat: ResultatAnnulation): Promise<void>;
  tracerTentativeAnnulation(evenement: TentativeConfirmation): Promise<void>;
}

/**
 * Une nuit d'un hébergement chez le simulateur, qui ne pose et ne confirme qu'une date à la fois : une option, puis une
 * réservation. Une ligne d'une nuit, ou qui n'est pas un hébergement, en a une seule.
 */
export interface NuitSimulateur { date: string; option_id: string; prix_total_cents: number; reservation_id?: string }

/** Ligne telle qu'elle était à la pose de l'option. */
export interface LigneSnapshot { prestation_id: string; date: string; participants: number; nb_nuits?: number }

export interface AccordOption extends NouvelAccord { option_id: string; accord_utilise: boolean; statut: 'accord_donne' | 'posee' | 'echec' | 'confirmee' | 'annulee'; }
export interface AccordOptionEtOption extends AccordOption {
  option_id_simulateur?: string; expire_option_le?: string; reservation_id_simulateur?: string; confirme_le?: string; reponse_confirmation?: unknown;
  ligne_snapshot: LigneSnapshot;
  /** Détail par nuit ; vide pour une démarche antérieure : la première nuit vaut alors pour toute la ligne (voir `nuitsDeLaDemarche`). */
  nuits?: NuitSimulateur[];
}
export type ResultatPoseOption =
  | { ok: true; option_id_simulateur: string; expire_le: string; reponse_serveur: unknown; ligne_snapshot?: LigneSnapshot; nuits?: NuitSimulateur[] }
  | { ok: false; raison: string; reponse_serveur?: unknown };

/** Nuits d'une démarche : celles enregistrées, sinon une seule, celle de l'option (démarche d'une nuit, ou antérieure). */
export function nuitsDeLaDemarche(o: AccordOptionEtOption): NuitSimulateur[] {
  if (o.nuits && o.nuits.length > 0) return o.nuits;
  if (!o.option_id_simulateur) return [];
  return [{
    date: o.ligne_snapshot.date, option_id: o.option_id_simulateur, prix_total_cents: o.prix_accorde_cents,
    ...(o.reservation_id_simulateur ? { reservation_id: o.reservation_id_simulateur } : {}),
  }];
}
export interface TentativeOption {
  dossier_id: string; proposition_id: string; ligne_id: string; auteur_id: string;
  raison: string; date: string;
}

export type ResultatConfirmation =
  | { ok: true; reservation_id_simulateur: string; reponse_serveur: unknown; confirme_par: string; nuits?: NuitSimulateur[] }
  | { ok: false; raison: string; reponse_serveur?: unknown };
export interface TentativeConfirmation { ligne_id: string; auteur_id: string; raison: string; date: string; detail?: unknown }

export type ResultatAnnulation = { ok: true; reservation_id_simulateur: string; reponse_serveur: unknown } | { ok: false; raison: string; reponse_serveur?: unknown };
