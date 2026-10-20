/**
 * Port Prestataires (ADR-0011) : tout ce que l'application demande au simulateur du formateur
 * passe par cette interface. Les montants sont en CENTIMES ; les pannes sont des valeurs
 * explicites (`ResultatSimulateur`), jamais des exceptions ni des prix inventés.
 */
import type { ResultatSimulateur } from '../../types';

export interface PrestationCatalogue {
  id: string;
  type: 'transport' | 'hebergement' | 'activite';
  nom: string;
  destination: string;
  prix_unitaire_cents: number;
  capacite: number;
  description?: string;
  tags: string[];
}

export interface LigneDemandee {
  prestation_id: string;
  date: string; // AAAA-MM-JJ
  participants: number;
}

export interface Disponibilite extends LigneDemandee {
  disponible: boolean;
  places_restantes: number;
  prix_unitaire_cents: number;
  prix_total_cents: number;
}

export interface OptionPosee extends LigneDemandee {
  option_id: string;
  prix_total_cents: number;
  statut: 'active' | 'expiree' | 'confirmee';
  expire_le: string;
}

export interface ReservationConfirmee extends LigneDemandee {
  reservation_id: string;
  option_id: string;
  prix_total_cents: number;
  statut: 'confirmee' | 'annulee';
  approuve_par: string;
  confirmee_le: string;
}

export interface Prestataires {
  catalogue(): Promise<ResultatSimulateur<PrestationCatalogue[]>>;
  /** Lecture seule : ne bloque aucune place. */
  disponibilite(ligne: LigneDemandee): Promise<ResultatSimulateur<Disponibilite>>;
  /** Écriture : réservée aux cas d'usage qui ont un accord valide (E9.4). Jamais appelée par l'agent. */
  poserOption(ligne: LigneDemandee): Promise<ResultatSimulateur<OptionPosee>>;
  /** Écriture : demande la clé d'approbation saisie par le conseiller et son nom. */
  confirmerReservation(args: { option_id: string; cle_approbation: string; approuve_par: string }): Promise<ResultatSimulateur<ReservationConfirmee>>;
  /** Could (E9.8). */
  annulerReservation(args: { reservation_id: string; cle_approbation: string; approuve_par: string }): Promise<ResultatSimulateur<ReservationConfirmee>>;
}
