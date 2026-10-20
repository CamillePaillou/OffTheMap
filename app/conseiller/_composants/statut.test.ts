import { describe, expect, it } from 'vitest';
import { STATUTS_DOSSIER, STATUTS_PROPOSITION } from '../../../types/enums';
import { GROUPES, groupeDe, joursAvantDepart, prochaineEtape } from './statut';

describe('groupes de dossiers', () => {
  it('chaque statut appartient à exactement un groupe', () => {
    for (const s of STATUTS_DOSSIER) expect(GROUPES.filter((g) => (g.statuts as readonly string[]).includes(s))).toHaveLength(1);
    expect(groupeDe('fiche_prete').id).toBe('a_trier');
  });
});

describe('prochaine étape', () => {
  it('donne une étape pour chaque statut de dossier et de proposition', () => {
    for (const s of STATUTS_DOSSIER) expect(prochaineEtape(s).texte).toBeTruthy();
    for (const p of STATUTS_PROPOSITION) expect(prochaineEtape('en_proposition', { statut: p }).texte).toBeTruthy();
  });
  it('dit qui doit agir', () => {
    expect(prochaineEtape('fiche_prete')).toEqual({ texte: 'Trier la demande', acteur: 'conseiller' });
    expect(prochaineEtape('a_corriger').acteur).toBe('client');
    expect(prochaineEtape('fiche_en_cours').acteur).toBe('systeme');
    expect(prochaineEtape('gagnee').acteur).toBeNull();
  });
  it('compte les prix à vérifier d’une proposition', () => {
    expect(prochaineEtape('en_proposition', { statut: 'a_verifier', lignes_a_verifier: 2 }).texte).toBe('Vérifier 2 prix');
    expect(prochaineEtape('en_proposition', { statut: 'envoyee' }).acteur).toBe('client');
    expect(prochaineEtape('en_proposition', { statut: 'sans_reponse' })).toEqual({ texte: 'Relancer le client', acteur: 'conseiller' });
  });
});

describe('jours avant le départ', () => {
  it('compte en jours calendaires à Paris, même tard le soir', () => {
    const tardLeSoir = new Date('2026-10-20T22:30:00Z'); // déjà le 21 à Paris
    expect(joursAvantDepart('2026-10-21', tardLeSoir)).toBe(0);
    expect(joursAvantDepart('2026-11-07', new Date('2026-10-20T08:00:00Z'))).toBe(18);
    expect(joursAvantDepart('2026-10-19', new Date('2026-10-20T08:00:00Z'))).toBe(-1);
  });
});
