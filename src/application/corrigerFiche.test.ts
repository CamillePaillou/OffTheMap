import { describe, expect, it } from 'vitest';
import type { CorrectionFiche } from '../../types/fiche';
import type { FichesRepository } from '../ports/dossiers';
import { StatutsEnMemoire } from '../infrastructure/db/statutsEnMemoire';
import { corrigerFiche } from './corrigerFiche';
import { relancerFiche } from './relancerFiche';

class FichesEnMemoire implements FichesRepository {
  readonly corrections = new Map<string, CorrectionFiche>();
  constructor(private readonly avecFiche = new Set<string>()) {}
  async corriger(dossierId: string, c: CorrectionFiche) {
    if (!this.avecFiche.has(dossierId)) return 'sans_fiche' as const;
    this.corrections.set(dossierId, c);
    return 'ok' as const;
  }
}

const saisie = { budget_reel_euros: 380, date_debut_fixe: '2026-11-07', date_fin_fixe: '2026-11-08', nb_nuits_fixe: 1, notes_conseiller: '  Rappeler mardi  ' };

describe('corriger la fiche après l’entretien (E2.1)', () => {
  it('enregistre le budget réel en centimes, les dates fixes et les notes', async () => {
    const repo = new FichesEnMemoire(new Set(['d1']));
    expect(await corrigerFiche(repo, 'd1', saisie)).toEqual({ ok: true });
    expect(repo.corrections.get('d1')).toEqual({
      budget_reel_cents: 38000, date_debut_fixe: '2026-11-07', date_fin_fixe: '2026-11-08', nb_nuits_fixe: 1, notes_conseiller: 'Rappeler mardi',
    });
  });

  it('un champ vidé vaut null', async () => {
    const repo = new FichesEnMemoire(new Set(['d1']));
    await corrigerFiche(repo, 'd1', { budget_reel_euros: null, date_debut_fixe: null, date_fin_fixe: null, nb_nuits_fixe: null, notes_conseiller: '' });
    expect(repo.corrections.get('d1')).toEqual({ budget_reel_cents: null, date_debut_fixe: null, date_fin_fixe: null, nb_nuits_fixe: null, notes_conseiller: null });
  });

  it.each([
    [{ budget_reel_euros: 0 }, 'budget_reel_euros'],
    [{ budget_reel_euros: 12.5 }, 'budget_reel_euros'],
    [{ date_debut_fixe: '2026-11-08', date_fin_fixe: '2026-11-07' }, 'date_fin_fixe'],
    [{ nb_nuits_fixe: 2 }, 'nb_nuits_fixe'],
    [{ nb_nuits_fixe: 15, date_fin_fixe: '2026-11-30' }, 'nb_nuits_fixe'],
    [{ date_debut_fixe: '7/11/2026' }, 'date_debut_fixe'],
  ])('refuse %o sans rien écrire, erreur sur %s', async (surcharge, champ) => {
    const repo = new FichesEnMemoire(new Set(['d1']));
    const r = await corrigerFiche(repo, 'd1', { ...saisie, ...surcharge });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erreurs[champ]).toBeTruthy();
    expect(repo.corrections.size).toBe(0);
  });

  it('refuse de corriger une fiche pas encore générée', async () => {
    const r = await corrigerFiche(new FichesEnMemoire(), 'd1', saisie);
    expect(r).toEqual({ ok: false, erreurs: { formulaire: 'La fiche n’a pas encore été générée.' } });
  });
});

describe('relancer une fiche en erreur (E2.1)', () => {
  it('erreur → fiche_en_cours, journalisé au nom du conseiller', async () => {
    const repo = new StatutsEnMemoire();
    repo.dossiers.set('d1', { statut: 'erreur' });
    const r = await relancerFiche(repo, 'd1', 'c1');
    expect(r).toMatchObject({ ok: true, ancien: 'erreur', nouveau: 'fiche_en_cours' });
    expect(repo.historique).toEqual([expect.objectContaining({ ancien_statut: 'erreur', nouveau_statut: 'fiche_en_cours', auteur: 'conseiller', auteur_id: 'c1' })]);
  });

  it('refuse de relancer une fiche qui n’est pas en erreur', async () => {
    const repo = new StatutsEnMemoire();
    repo.dossiers.set('d1', { statut: 'fiche_prete' });
    expect(await relancerFiche(repo, 'd1', 'c1')).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(repo.historique).toHaveLength(0);
  });
});
