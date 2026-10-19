/**
 * Réponses du simulateur du formateur (server/app.py, contrat CONTRAT.md), telles qu'elles arrivent.
 * Montants en euros entiers : la conversion en centimes se fait UNIQUEMENT dans l'adaptateur
 * (src/infrastructure/prestataires). Aucune autre couche ne lit ces types.
 */
import { z } from 'zod';
import { LIMITES, TYPES_PRESTATION } from './enums';

const idPrestation = z.string().regex(/^[a-z0-9-]+$/);
const dateJour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-JJ');

export const PrestationSimulateur = z.object({
  id: idPrestation,
  type: z.enum(TYPES_PRESTATION),
  nom: z.string(),
  destination: z.string(),
  prix_unitaire_eur: z.number().int().nonnegative(),
  capacite: z.number().int().positive(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export const CatalogueSimulateur = z.object({ prestations: z.array(PrestationSimulateur) });

/** GET /api/v1/disponibilites : une lecture ne bloque aucune place. */
export const DisponibiliteSimulateur = z.object({
  prestation_id: idPrestation,
  date: dateJour,
  participants: z.number().int().min(1).max(LIMITES.participantsMax),
  disponible: z.boolean(),
  places_restantes: z.number().int().nonnegative(),
  prix_unitaire_eur: z.number().int().nonnegative(),
  prix_total_eur: z.number().int().nonnegative(),
  devise: z.literal('EUR'),
  simulation: z.literal(true),
});

/** POST /api/v1/options : le simulateur recalcule et fige le prix total à la pose. */
export const OptionSimulateur = z.object({
  id: z.string().startsWith('opt_'),
  prestation_id: idPrestation,
  date: dateJour,
  participants: z.number().int(),
  prix_total_eur: z.number().int().nonnegative(),
  statut: z.enum(['active', 'expiree', 'confirmee']), // « active » devient « posee » chez nous
  expire_le: z.string().datetime({ offset: true }),
  simulation: z.literal(true),
});

/** POST /api/v1/reservations (X-Approval-Key + approuve_par). */
export const ReservationSimulateur = z.object({
  id: z.string().startsWith('res_'),
  option_id: z.string(),
  prestation_id: idPrestation,
  date: dateJour,
  participants: z.number().int(),
  prix_total_eur: z.number().int().nonnegative(),
  statut: z.enum(['confirmee', 'annulee']),
  approuve_par: z.string().max(LIMITES.nomConseillerMax),
  confirmee_le: z.string().datetime({ offset: true }),
  annulee_le: z.string().datetime({ offset: true }).optional(),
  simulation: z.literal(true),
});

/** Erreurs JSON du simulateur. Codes vus dans server/app.py. */
export const CODES_ERREUR_SIMULATEUR = [
  'invalid_date', 'invalid_participants', 'prestation_not_found', 'unavailable', 'option_not_found',
  'option_not_active', 'option_expired', 'human_approval_required', 'approval_identity_required',
  'reservation_not_found', 'reservation_not_active', 'internal_error',
] as const;
export const ErreurSimulateur = z.object({
  erreur: z.object({ code: z.string(), message: z.string() }),
});

export type PrestationSimulateur = z.infer<typeof PrestationSimulateur>;
export type DisponibiliteSimulateur = z.infer<typeof DisponibiliteSimulateur>;
export type OptionSimulateur = z.infer<typeof OptionSimulateur>;
export type ReservationSimulateur = z.infer<typeof ReservationSimulateur>;
export type ErreurSimulateur = z.infer<typeof ErreurSimulateur>;

/**
 * Ce que l'adaptateur rend au reste de l'application : centimes, et pannes explicites.
 * « delai » et « erreur_serveur » peuvent aussi être simulés par l'adaptateur (E0.17).
 */
export type ResultatSimulateur<T> =
  | { ok: true; valeur: T }
  | { ok: false; panne: 'delai' | 'erreur_serveur' | 'reponse_invalide' }
  | { ok: false; panne: 'refus'; code: string; message: string; http: number };
