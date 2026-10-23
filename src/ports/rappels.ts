/**
 * Port des rappels (E6.4, E6.5). L'adaptateur PostgreSQL lit les propositions qui attendent une réponse et journalise un
 * rappel par enregistrer_rappel : au premier rappel, envoyee → sans_reponse et rappel écrits ensemble, ou rien.
 */
import type { JourRappel } from '../domain/rappels';

export interface PropositionEnAttente {
  id: string;
  statut: 'envoyee' | 'sans_reponse';
  envoyee_le: string;
  /** Jours des rappels déjà journalisés pour cette proposition. */
  rappels: number[];
}

/** Levée quand la proposition a reçu une réponse, ou que le rappel a été fait, entre la lecture et l'écriture. */
export class RappelConcurrentErreur extends Error {}

export interface RappelsRepository {
  /** Propositions envoyees ou sans_reponse, avec leurs rappels. */
  enAttente(): Promise<PropositionEnAttente[]>;
  /** Rejette RappelConcurrentErreur si la proposition n'attend plus de réponse ou si le rappel existe déjà. */
  enregistrerRappel(propositionId: string, jour: JourRappel): Promise<void>;
}

/** Proposition sans réponse affichée au conseiller pour qu'il relance le client. */
export interface PropositionARelancer {
  proposition_id: string;
  dossier_id: string;
  version: number;
  client_nom: string;
  envoyee_le: string;
  dernier_rappel: JourRappel;
}

export interface RappelsLecture {
  /** Propositions sans_reponse d'un dossier non abandonné, de la plus anciennement envoyée à la plus récente. */
  aRelancer(): Promise<PropositionARelancer[]>;
}
