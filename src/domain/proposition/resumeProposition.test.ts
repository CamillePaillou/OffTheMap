import { describe, expect, it } from 'vitest';
import { PROPOSITION } from '../../../fixtures/dashboard';
import { resumerProposition } from './resumeProposition';

describe('résumé d’une proposition (E4.5)', () => {
  it('exemple B des règles de chiffrage : 368 € sur 400 €, 92 %, alerte de budget non bloquante', () => {
    const r = resumerProposition(PROPOSITION);
    expect(r.budget).toEqual({ reference_cents: 40000, part_pourcent: 92, depasse: false });
    expect(r.generales.map((a) => [a.code, a.libelle, a.bloquante])).toEqual([['budget_proche', 'Budget presque atteint', false]]);
    expect(r.bloquantes).toBe(0);
  });

  it('alertes rattachées à leur ligne, bloquantes comptées', () => {
    const r = resumerProposition({
      total_cents: 50000,
      budget_reference_cents: 40000,
      alertes: [
        { code: 'capacite_depassee', ligne_id: 'l1', message: 'hotel : 12 participants pour 8' },
        { code: 'date_hors_sejour', ligne_id: 'l1', message: 'hotel : le 2026-11-08' },
        { code: 'budget_depasse', message: 'Total 500,00 € pour 400,00 €' },
      ],
    });
    expect(r.parLigne.get('l1')?.map((a) => a.code)).toEqual(['capacite_depassee', 'date_hors_sejour']);
    expect(r.generales.map((a) => a.code)).toEqual(['budget_depasse']);
    expect(r.bloquantes).toBe(2);
    expect(r.budget).toMatchObject({ part_pourcent: 125, depasse: true });
  });

  it('pourcentage tronqué, jamais arrondi au-dessus : 89,9 % reste 89 %', () => {
    expect(resumerProposition({ total_cents: 35960, budget_reference_cents: 40000, alertes: [] }).budget?.part_pourcent).toBe(89);
  });

  it('sans budget de référence ni total : pas de comparaison', () => {
    expect(resumerProposition({ total_cents: 7000, budget_reference_cents: null, alertes: [] }).budget).toBeNull();
    expect(resumerProposition({ total_cents: null, budget_reference_cents: 40000, alertes: [] }).budget).toBeNull();
  });
});
