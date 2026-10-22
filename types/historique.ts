/**
 * Forme de `historique_dossier.detail` selon le type d'événement.
 * Règle : aucune donnée personnelle, aucune clé, aucun texte libre du client dans le détail.
 */
import type { DecisionTri, StatutDossier, StatutOption, StatutProposition, StatutVerification } from './enums';

export type DetailEvenement =
  | { type: 'statut'; cible: 'dossier'; ancien: StatutDossier | null; nouveau: StatutDossier; decision?: DecisionTri }
  | { type: 'statut'; cible: 'proposition'; ancien: StatutProposition | null; nouveau: StatutProposition }
  | { type: 'mail'; modele: 'rendez_vous' | 'a_corriger' | 'proposition' | 'confirmation' }
  | { type: 'correction_demandee'; boucle: number; champs: string[] } // événement « mail » : lien de correction créé (E1.2)
  | { type: 'rappel'; jour: 3 | 7 | 14 }
  | { type: 'depot' }
  | { type: 'changement'; version_remplacee: number; nouvelle_version: number }
  // E7.4 : événement « changement » après le dépôt, avec l'accord du client
  | { type: 'remplacement'; ligne_id: string; nouvelle_ligne_id: string; ancienne_prestation: string; nouvelle_prestation: string;
      ancien_total_cents: number; nouveau_total_catalogue_cents: number; accord_client: true }
  | { type: 'retrait'; ligne_id: string; ancienne_prestation: string; ancien_total_cents: number; accord_client: true }
  | { type: 'verification'; verification_id: string; ligne_id: string; statut: StatutVerification }
  | { type: 'accord'; option_id: string; ligne_id: string; prix_accorde_cents: number }
  | { type: 'option'; option_id: string; statut: StatutOption; option_id_simulateur?: string; code_erreur?: string }
  | { type: 'reservation'; option_id: string; reservation_id_simulateur?: string; code_erreur?: string };

/** Ce que le point d'écriture unique (E0.7) reçoit. */
export interface Evenement {
  dossier_id: string;
  proposition_id?: string;
  auteur: { type: 'systeme' } | { type: 'conseiller'; id: string };
  detail: DetailEvenement;
}
