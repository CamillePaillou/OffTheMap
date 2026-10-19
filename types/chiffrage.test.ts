import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALERTES_BLOQUANTES, CODES_ALERTE, REGLES_CHIFFRAGE, type CodeAlerte } from './chiffrage';

interface Ligne {
  prestation_id: string; type: 'transport' | 'hebergement' | 'activite'; capacite: number; actif: boolean;
  date: string; participants: number; prix_unitaire_catalogue_cents: number; prix_confirme_cents: number | null;
}
interface Cas {
  id: string; titre: string;
  entree: { voyageurs: number; date_debut: string; date_fin: string; nb_nuits: number; budget_reference_cents: number | null; lignes: Ligne[] };
  attendu: { totaux_lignes_cents: number[]; total_cents: number; alertes: CodeAlerte[] };
}
const exemples = JSON.parse(readFileSync(join(__dirname, '../docs/specs/chiffrage-exemples.json'), 'utf8')) as { cas: Cas[] };

/** Lecture littérale des règles de docs/specs/chiffrage.md, pour vérifier que les exemples les respectent. */
function regles(e: Cas['entree']) {
  const totaux = e.lignes.map((l) => (l.prix_confirme_cents ?? l.prix_unitaire_catalogue_cents) * l.participants);
  const total = totaux.reduce((a, b) => a + b, 0) + REGLES_CHIFFRAGE.margeCents;
  const alertes = new Set<CodeAlerte>();
  const veilleDepart = new Date(Date.parse(e.date_fin) - 86_400_000).toISOString().slice(0, 10);
  for (const l of e.lignes) {
    if (l.participants > l.capacite) alertes.add('capacite_depassee');
    if (l.participants > e.voyageurs) alertes.add('participants_superieurs_voyageurs');
    if (!l.actif) alertes.add('prestation_inactive');
    const fin = l.type === 'hebergement' ? veilleDepart : e.date_fin;
    if (l.date < e.date_debut || l.date > fin) alertes.add('date_hors_sejour');
  }
  const nuits = new Set(e.lignes.filter((l) => l.type === 'hebergement').map((l) => l.date)).size;
  if (nuits !== e.nb_nuits) alertes.add('nuits_incoherentes');
  if (e.budget_reference_cents !== null) {
    if (total > e.budget_reference_cents) alertes.add('budget_depasse');
    else if (total >= REGLES_CHIFFRAGE.seuilBudgetProche * e.budget_reference_cents) alertes.add('budget_proche');
  }
  return { totaux, total, alertes: [...alertes].sort() };
}

describe('exemples de chiffrage', () => {
  it('n’emploient que des codes d’alerte connus, au moins cinq différents', () => {
    const vus = new Set(exemples.cas.flatMap((c) => c.attendu.alertes));
    for (const code of vus) expect(CODES_ALERTE).toContain(code);
    expect(vus.size).toBeGreaterThanOrEqual(5);
  });
  it.each(exemples.cas.map((c) => [c.id, c] as const))('cas %s : résultat attendu conforme aux règles', (_id, c) => {
    const r = regles(c.entree);
    expect(r.totaux).toEqual(c.attendu.totaux_lignes_cents);
    expect(r.total).toBe(c.attendu.total_cents);
    expect(r.alertes).toEqual(c.attendu.alertes);
  });
  it('n’utilise que des montants entiers en centimes', () => {
    for (const c of exemples.cas) {
      for (const l of c.entree.lignes) expect(Number.isInteger(l.prix_unitaire_catalogue_cents)).toBe(true);
      expect(Number.isInteger(c.attendu.total_cents)).toBe(true);
    }
  });
  it('classe les alertes de séjour et de capacité comme bloquantes, le budget non', () => {
    expect(ALERTES_BLOQUANTES).toContain('capacite_depassee');
    expect(ALERTES_BLOQUANTES).not.toContain('budget_depasse');
  });
});
