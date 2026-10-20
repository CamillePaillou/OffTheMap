/**
 * Port d'écriture de l'accord (E9.3). L'adaptateur PostgreSQL insère une ligne `options` au statut
 * `accord_donne` (retrouve lui-même la vérification de la ligne, `verification_id`) et l'événement
 * `accord` de l'historique dans la même transaction. L'index unique `options_une_en_cours_par_ligne`
 * garantit une seule démarche en cours par ligne.
 */
export interface NouvelAccord {
  dossier_id: string;
  proposition_id: string;
  ligne_id: string;
  accord_par: string; // id du conseiller
  accord_le: string;
  accord_expire_le: string;
  prix_accorde_cents: number; // prix TOTAL autorisé pour la ligne
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
  /** Lit l'accord non expiré de la ligne (affichage et préparation de la pose). */
  accordValable(ligneId: string, maintenant: Date): Promise<AccordOption | undefined> | AccordOption | undefined;
  /** Consomme atomiquement un accord non expiré, avant l'appel d'écriture externe. */
  consommerAccord(optionId: string, maintenant: Date): Promise<AccordOption | null>;
  /** Enregistre la réponse réelle ou l'échec du simulateur et l'événement correspondant. */
  terminerPoseOption(optionId: string, resultat: ResultatPoseOption): Promise<void>;
  /** Journalise aussi les tentatives refusées avant toute écriture externe. */
  tracerTentativeOption(evenement: TentativeOption): Promise<void>;
}

export interface AccordOption extends NouvelAccord { option_id: string; accord_utilise: boolean; statut: 'accord_donne' | 'posee' | 'echec'; }
export type ResultatPoseOption =
  | { ok: true; option_id_simulateur: string; expire_le: string; reponse_serveur: unknown }
  | { ok: false; raison: string; reponse_serveur?: unknown };
export interface TentativeOption {
  dossier_id: string; proposition_id: string; ligne_id: string; auteur_id: string;
  raison: string; date: string;
}
