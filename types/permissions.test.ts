import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTILS_AUTORISES } from './ia';
import { ACTEURS, PERMISSIONS, SECRETS, peut } from './permissions';
import { TRANSITIONS_OPTION } from './transitions';

describe('schéma des permissions', () => {
  it('ne donne au modèle aucune écriture, ni en base ni chez le prestataire', () => {
    const duModele = PERMISSIONS.filter((p) => p.autorises.includes('modele'));
    expect(duModele.length).toBeGreaterThan(0);
    for (const p of duModele) expect(['lecture', 'proposition'], p.action).toContain(p.nature);
  });
  it('ne donne au modèle qu’un seul outil, en lecture', () => {
    expect([...OUTILS_AUTORISES]).toEqual(['verifier_disponibilite']);
  });
  it('réserve chaque écriture chez le prestataire au système ou au conseiller', () => {
    for (const p of PERMISSIONS.filter((x) => x.nature === 'ecriture_externe')) {
      expect(p.autorises).not.toContain('modele');
      expect(p.autorises).not.toContain('visiteur');
    }
  });
  it('est cohérent avec les transitions : le système pose, le conseiller confirme et annule', () => {
    const par = (vers: string) => TRANSITIONS_OPTION.filter((t) => t.vers === vers).map((t) => t.par);
    expect(par('posee')).toEqual(['systeme']);
    expect(par('confirmee')).toEqual(['conseiller']);
    expect(par('annulee')).toEqual(['conseiller']);
    expect(peut('systeme', 'Poser une option sur le simulateur')).toBe(true);
    expect(peut('conseiller', 'Confirmer une réservation')).toBe(true);
    expect(peut('modele', 'Confirmer une réservation')).toBe(false);
  });
  it('ne laisse aucun secret au modèle', () => {
    for (const s of SECRETS) expect(s.detenteur.toLowerCase()).not.toContain('modèle');
  });
  it('donne au moins une action à chaque acteur', () => {
    for (const a of ACTEURS) expect(PERMISSIONS.some((p) => p.autorises.includes(a)), a).toBe(true);
  });
});

describe('docs/specs/permissions.md', () => {
  const md = readFileSync(join(__dirname, '../docs/specs/permissions.md'), 'utf8');
  it('reprend exactement la matrice du fichier', () => {
    const lignes = md.split('\n').filter((l) => /^\| [^|]+ \| (lecture|proposition|écriture|écriture chez le prestataire) \|/.test(l));
    expect(lignes).toHaveLength(PERMISSIONS.length);
    PERMISSIONS.forEach((p, i) => {
      const cells = lignes[i]!.split('|').slice(1, -1).map((c) => c.trim());
      expect(cells[0]).toBe(p.action);
      expect(cells.slice(2, 2 + ACTEURS.length)).toEqual(ACTEURS.map((a) => (p.autorises.includes(a) ? 'oui' : '—')));
    });
  });
});
