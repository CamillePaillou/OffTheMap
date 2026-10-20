import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAMPS_CORRIGEABLES, MOTIFS_TYPES, REGLES_CORRECTION, schemaDemandeCorrection } from './correction';

describe('motifs types liés aux champs (E3.3)', () => {
  it('proposent au moins un motif pour chaque point à revoir', () => {
    expect(Object.keys(MOTIFS_TYPES)).toEqual([...CHAMPS_CORRIGEABLES]);
    for (const c of CHAMPS_CORRIGEABLES) expect(MOTIFS_TYPES[c].length, c).toBeGreaterThan(0);
  });

  it('sont des commentaires valides, adressés au client', () => {
    for (const c of CHAMPS_CORRIGEABLES) {
      for (const m of MOTIFS_TYPES[c]) {
        expect(m.length, m).toBeLessThanOrEqual(REGLES_CORRECTION.commentaireMax);
        expect(schemaDemandeCorrection.safeParse({ champs: [c], motif: 'x', commentaires: { [c]: m } }).success, m).toBe(true);
        expect(m, m).not.toMatch(/fiche|IA|conseiller interne|OT0/); // rien d'interne
      }
    }
  });

  it('sont proposés à la saisie du commentaire, sans l’imposer', () => {
    const panneau = readFileSync(join(__dirname, '../app/conseiller/dossiers/[id]/panneauTri.tsx'), 'utf8');
    expect(panneau).toContain('list={`motifs-${c}`}');
    expect(panneau).toContain('<datalist id={`motifs-${c}`}>');
  });
});

describe('encart d’explication du formulaire de correction (E3.3)', () => {
  const page = readFileSync(join(__dirname, '../app/demande/corriger/[jeton]/page.tsx'), 'utf8');
  it('explique pourquoi, quoi revoir et comment faire', () => {
    expect(page).toContain('Pourquoi votre conseiller vous recontacte');
    expect(page).toContain('Les points à revoir');
    expect(page).toContain('Comment faire');
  });
  it('donne une explication à chaque champ surligné, même sans commentaire', () => {
    expect(page).toContain("lecture.commentaires[c] ?? COMMENTAIRE_PAR_DEFAUT");
  });
});
