import { describe, expect, it } from 'vitest';
import { STATUTS_DOSSIER, STATUTS_LIGNE, STATUTS_PROPOSITION } from './enums';
import { FAMILLE_STATUT, FAMILLE_STATUT_LIGNE, FAMILLE_STATUT_PROPOSITION } from './statuts-famille';

describe('familles de statut', () => {
  it.each(STATUTS_DOSSIER)('%s : une famille et un libellé', (s) => {
    expect(FAMILLE_STATUT[s].famille).toBeTruthy();
    expect(FAMILLE_STATUT[s].libelle.trim()).not.toBe('');
  });

  it('aucune clé en trop', () => {
    expect(Object.keys(FAMILLE_STATUT).sort()).toEqual([...STATUTS_DOSSIER].sort());
  });

  it('gagnee s’affiche « Conclue »', () => {
    expect(FAMILLE_STATUT.gagnee).toMatchObject({ famille: 'conclue', libelle: 'Conclue' });
  });

  it.each([
    ['proposition', STATUTS_PROPOSITION, FAMILLE_STATUT_PROPOSITION],
    ['ligne', STATUTS_LIGNE, FAMILLE_STATUT_LIGNE],
  ] as const)('%s : chaque statut a une famille et un libellé, sans clé en trop', (_, statuts, familles) => {
    expect(Object.keys(familles).sort()).toEqual([...statuts].sort());
    for (const s of statuts) expect((familles as Record<string, { libelle: string }>)[s]!.libelle.trim()).not.toBe('');
  });
});
