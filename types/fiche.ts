/**
 * Correction de la fiche après l'entretien (E2.1) : budget réel, destination, dates fixes et notes du conseiller.
 * Destination en texte libre (l'écran signale les villes du catalogue) ; les nuits se déduisent des dates fixes (corriger_fiche).
 * Ces champs ne sont écrits que par corriger_fiche ; une régénération (enregistrer_generation_fiche) ne les touche pas.
 * Le budget est GLOBAL, pour tout le groupe (docs/specs/chiffrage.md) ; saisi en euros, stocké en centimes.
 * Un champ vide vaut null : le conseiller peut effacer une valeur.
 */
import { z } from 'zod';
import { nuitsEntre } from './demande';
import { LIMITES } from './enums';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').nullable();

/** Saisie du formulaire, après lecture de FormData (chaînes vides déjà converties en null). */
export const SaisieCorrectionFiche = z
  .object({
    budget_reel_euros: z.number({ message: 'Budget en euros entiers' }).int('Budget en euros entiers').positive('Le budget doit être positif').max(1_000_000).nullable(),
    destination_fixe: z.string().trim().max(120).transform((t) => (t === '' ? null : t)).nullable(),
    date_debut_fixe: date,
    date_fin_fixe: date,
    notes_conseiller: z.string().trim().max(4000, '4000 caractères maximum').transform((t) => (t === '' ? null : t)).nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.date_debut_fixe && d.date_fin_fixe) {
      if (d.date_fin_fixe < d.date_debut_fixe) {
        ctx.addIssue({ code: 'custom', path: ['date_fin_fixe'], message: 'La date de retour précède le départ' });
      } else if ((nuitsEntre(d.date_debut_fixe, d.date_fin_fixe) ?? 0) > LIMITES.nuitsMax) {
        ctx.addIssue({ code: 'custom', path: ['date_fin_fixe'], message: `${LIMITES.nuitsMax} nuits maximum entre le départ et le retour` });
      }
    }
  });
export type SaisieCorrectionFiche = z.infer<typeof SaisieCorrectionFiche>;

/** Colonnes écrites par corriger_fiche. */
export interface CorrectionFiche {
  budget_reel_cents: number | null;
  destination_fixe: string | null;
  date_debut_fixe: string | null;
  date_fin_fixe: string | null;
  notes_conseiller: string | null;
}

export function versCorrectionFiche(s: SaisieCorrectionFiche): CorrectionFiche {
  return {
    budget_reel_cents: s.budget_reel_euros === null ? null : s.budget_reel_euros * 100,
    destination_fixe: s.destination_fixe,
    date_debut_fixe: s.date_debut_fixe,
    date_fin_fixe: s.date_fin_fixe,
    notes_conseiller: s.notes_conseiller,
  };
}
