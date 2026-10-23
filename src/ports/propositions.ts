/** Propositions vues par le conseiller et vérifications de leurs lignes (E8.4), au format du dashboard. */
import type { Proposition, VerificationLigne } from '../../types/dashboard';
import type { ResultatVerification } from '../application/verifierPrestation';

export interface PropositionsLecture {
  /** null si la proposition n'existe pas. */
  proposition(id: string): Promise<Proposition | null>;
  /** Une version donnée des propositions d'un dossier (E6.2 : la version précédente), ou null. */
  versionDuDossier(dossierId: string, version: number): Promise<Proposition | null>;
  /** Dernière vérification de la ligne, ou null si elle n'a jamais été vérifiée. */
  verificationDeLigne(ligneId: string): Promise<VerificationLigne | null>;
}

export interface ResumeEcartsEcriture {
  /** E6.3 : écrit propositions.ecarts. Le serveur seul écrit (clé service_role). */
  enregistrerResumeEcarts(propositionId: string, ecarts: { resume: string; empreinte: string }): Promise<void>;
}

export interface VerificationsEcriture {
  /** Enregistre le résultat de l'agent tel quel (prix, places, réponse, trace expurgée). Renvoie l'id de la vérification. */
  enregistrer(ligneId: string, demandeParId: string, resultat: ResultatVerification): Promise<string>;
}
