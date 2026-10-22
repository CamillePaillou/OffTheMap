/**
 * Port de l'espace client (suivi de la demande, docs/specs/espace-client.md). L'adaptateur appelle les fonctions SQL
 * de la migration 20261023090000_espace_client.sql : suivi_public (sans compte), mes_demandes, ma_demande et
 * repondre_proposition (client connecté, adresse confirmée). Aucune table n'est lue directement.
 */
import type { StatutDossier, StatutLigne, StatutProposition } from '../../types/enums';

/** Suivi par le numéro de dossier : statuts et date, rien d'autre. */
export interface SuiviPublic {
  reference: string;
  dossier_statut: StatutDossier;
  proposition_statut: StatutProposition | null;
  mis_a_jour_le: string;
}

export interface DemandeResumee {
  dossier_id: string;
  reference: string;
  statut: StatutDossier;
  cree_le: string;
  destination: string | null;
  date_debut: string;
  date_fin: string;
  proposition_statut: StatutProposition | null;
}

export interface LignePropositionClient {
  nom: string;
  type: string;
  date: string;
  participants: number;
  /** Prix confirmé par le conseiller ; null tant qu'il n'est pas vérifié. */
  prix_unitaire_cents: number | null;
  confirme_le: string | null;
  statut: StatutLigne;
}

export interface ReponseEnLigne {
  type: 'acceptee' | 'changement';
  message: string | null;
  cree_le: string;
}

export interface PropositionClient {
  id: string;
  version: number;
  statut: StatutProposition;
  envoyee_le: string;
  programme: unknown;
  total_cents: number | null;
  conseiller: string | null;
  lignes: LignePropositionClient[];
  reponse: ReponseEnLigne | null;
}

export interface DetailDemande {
  dossier_id: string;
  reference: string;
  statut: StatutDossier;
  cree_le: string;
  mis_a_jour_le: string;
  proposition_statut: StatutProposition | null;
  demande: { destination: string | null; date_debut: string; date_fin: string; nb_nuits: number; voyageurs: number; envies: string | null } | null;
  proposition: PropositionClient | null;
}

export type ResultatReponseEnLigne = { ok: true } | { ok: false; raison: 'introuvable' | 'plus_en_attente' | 'deja_repondu' | 'message_requis' };

export interface EspaceClientRepository {
  suiviPublic(reference: string): Promise<SuiviPublic | null>;
  mesDemandes(): Promise<DemandeResumee[]>;
  maDemande(dossierId: string): Promise<DetailDemande | null>;
  repondre(propositionId: string, type: 'acceptee' | 'changement', message: string | null): Promise<ResultatReponseEnLigne>;
}
