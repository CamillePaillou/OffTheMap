/**
 * Ce que le conseiller relit avant l'envoi (E4.5) : total face au budget de référence, alertes rattachées à leur ligne
 * ou à toute la proposition, et lesquelles bloquent l'envoi. Règle pure, sur le payload du dashboard : rien n'est
 * recalculé ici, le total et les alertes viennent du chiffrage (E4.2).
 */
import { ALERTES_BLOQUANTES, type Alerte, type CodeAlerte } from '../../../types/chiffrage';

export const LIBELLES_ALERTE: Record<CodeAlerte, string> = {
  capacite_depassee: 'Capacité dépassée',
  participants_superieurs_voyageurs: 'Plus de participants que de voyageurs',
  date_hors_sejour: 'Date hors du séjour',
  nuits_incoherentes: 'Nuits incohérentes',
  prestation_inactive: 'Prestation retirée du catalogue',
  budget_depasse: 'Budget dépassé',
  budget_proche: 'Budget presque atteint',
};

export interface AlerteAffichee extends Alerte {
  libelle: string;
  bloquante: boolean;
}

export interface ResumeProposition {
  /** null sans budget de référence (aucune alerte de budget possible) ou sans total. */
  budget: { reference_cents: number; part_pourcent: number; depasse: boolean } | null;
  /** Alertes sans ligne : nuits, budget. */
  generales: AlerteAffichee[];
  /** Alertes d'une ligne, par id de ligne. */
  parLigne: Map<string, AlerteAffichee[]>;
  bloquantes: number;
}

export function resumerProposition(p: { total_cents: number | null; budget_reference_cents: number | null; alertes: readonly Alerte[] }): ResumeProposition {
  const affichees = p.alertes.map((a) => ({ ...a, libelle: LIBELLES_ALERTE[a.code], bloquante: ALERTES_BLOQUANTES.includes(a.code) }));
  const parLigne = new Map<string, AlerteAffichee[]>();
  for (const a of affichees) if (a.ligne_id) parLigne.set(a.ligne_id, [...(parLigne.get(a.ligne_id) ?? []), a]);

  const budget = p.budget_reference_cents !== null && p.total_cents !== null
    ? {
        reference_cents: p.budget_reference_cents,
        part_pourcent: Math.floor((p.total_cents * 100) / p.budget_reference_cents), // entiers : pas d'arrondi trompeur au-dessus du seuil
        depasse: p.total_cents > p.budget_reference_cents,
      }
    : null;

  return { budget, generales: affichees.filter((a) => !a.ligne_id), parLigne, bloquantes: affichees.filter((a) => a.bloquante).length };
}
