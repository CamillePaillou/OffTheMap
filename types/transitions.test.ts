import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as E from './enums';
import { MACHINES, TRANSITIONS_DOSSIER, TRANSITIONS_OPTION, trouverTransition, type Machine } from './transitions';

const VALEURS: Record<Machine, readonly string[]> = {
  dossier: E.STATUTS_DOSSIER,
  proposition: E.STATUTS_PROPOSITION,
  ligne: E.STATUTS_LIGNE,
  option: E.STATUTS_OPTION,
};
const machines = Object.keys(MACHINES) as Machine[];

describe.each(machines)('machine %s', (nom) => {
  const { transitions, finaux } = MACHINES[nom];
  const valeurs = VALEURS[nom];
  const etats = transitions as readonly { de: string | null; vers: string; par: string }[];

  it('n’utilise que des statuts de la migration', () => {
    for (const x of etats) {
      if (x.de !== null) expect(valeurs).toContain(x.de);
      expect(valeurs).toContain(x.vers);
    }
  });
  it('couvre tous les statuts : chacun est atteignable depuis la création', () => {
    const atteints = new Set<string>();
    let file = etats.filter((x) => x.de === null).map((x) => x.vers);
    while (file.length) {
      const s = file.pop()!;
      if (atteints.has(s)) continue;
      atteints.add(s);
      file = file.concat(etats.filter((x) => x.de === s).map((x) => x.vers));
    }
    expect([...atteints].sort()).toEqual([...valeurs].sort());
  });
  it('ne fait sortir aucun état final, et donne une sortie à tous les autres', () => {
    for (const v of valeurs) {
      const sorties = etats.filter((x) => x.de === v);
      if ((finaux as readonly string[]).includes(v)) expect(sorties, v).toHaveLength(0);
      else expect(sorties.length, v).toBeGreaterThan(0);
    }
  });
  it('n’a pas de transition en double', () => {
    const cles = etats.map((x) => `${x.de}>${x.vers}>${x.par}`);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe('règles clés', () => {
  it('refuse une transition absente de la matrice', () => {
    expect(trouverTransition(TRANSITIONS_DOSSIER, 'nouvelle', 'gagnee', 'systeme')).toBeNull();
  });
  it('refuse une transition faite par le mauvais auteur', () => {
    expect(trouverTransition(TRANSITIONS_DOSSIER, 'fiche_prete', 'go', 'systeme')).toBeNull();
    expect(trouverTransition(TRANSITIONS_OPTION, 'posee', 'confirmee', 'systeme')).toBeNull();
  });
  it('n’accorde jamais au système la confirmation d’une réservation', () => {
    expect(TRANSITIONS_OPTION.filter((x) => x.vers === 'confirmee').every((x) => x.par === 'conseiller')).toBe(true);
  });
});

describe('docs/specs/transitions.md', () => {
  const md = readFileSync(join(__dirname, '../docs/specs/transitions.md'), 'utf8');
  const lignes = md.split('\n').filter((l) => /^\| (—|[a-z_]+) \| [a-z_]+ \| (conseiller|systeme) \|/.test(l));
  it('liste exactement les transitions du fichier', () => {
    const doc = lignes.map((l) => l.split('|').slice(1, 4).map((x) => x.trim()).join('>')).sort();
    const code = machines.flatMap((m) =>
      (MACHINES[m].transitions as readonly { de: string | null; vers: string; par: string }[])
        .map((x) => [x.de ?? '—', x.vers, x.par].join('>'))).sort();
    expect(doc).toEqual(code);
  });
});
