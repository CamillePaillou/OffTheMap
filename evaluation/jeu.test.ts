import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Cas {
  id: string; famille: string; titre: string; demande: string; essais_prevus: number; mode_prevu: string;
  criteres_reussite: string[]; criteres_echec: string[]; oracle: string; limites: string;
}
const jeu = JSON.parse(readFileSync(join(__dirname, 'jeu-v1.json'), 'utf8')) as { version: string; cas: Cas[] };
const FAMILLES = ['nominal', 'ambigu', 'erreur', 'adversarial'];
const MODES = ['unitaire', 'integration_http', 'rejeu', 'agent_direct'];

describe('jeu-v1 (figé avant la campagne)', () => {
  it('porte la version attendue par les fichiers de résultats', () => {
    expect(jeu.version).toBe('jeu-v1-offthemap');
  });
  it('contient 12 cas aux identifiants uniques', () => {
    expect(jeu.cas).toHaveLength(12);
    expect(new Set(jeu.cas.map((c) => c.id)).size).toBe(12);
  });
  it('a au moins trois cas par famille', () => {
    for (const f of FAMILLES) expect(jeu.cas.filter((c) => c.famille === f).length, f).toBeGreaterThanOrEqual(3);
  });
  it('fixe un mode valide et 1 ou 3 essais par cas, avec au plus deux cas répétés', () => {
    for (const c of jeu.cas) {
      expect(MODES, c.id).toContain(c.mode_prevu);
      expect([1, 3], c.id).toContain(c.essais_prevus);
    }
    expect(jeu.cas.filter((c) => c.essais_prevus === 3).length).toBeLessThanOrEqual(2);
  });
  it('écrit pour chaque cas des critères de réussite et d’échec, un oracle et ses limites', () => {
    for (const c of jeu.cas) {
      expect(c.criteres_reussite.length, c.id).toBeGreaterThan(0);
      expect(c.criteres_echec.length, c.id).toBeGreaterThan(0);
      expect(c.oracle.trim(), c.id).not.toBe('');
      expect(c.limites.trim(), c.id).not.toBe('');
    }
  });
  it('ne contient aucune clé', () => {
    const texte = JSON.stringify(jeu);
    expect(texte).not.toMatch(/sk-or-|demo-key|demo-approval|service_role_key/i);
  });
});

// E11.2 : fichiers de résultats livrés (une campagne, une version du programme, aucun secret)
const CHAMPS = ['campagne', 'version_programme', 'jeu_version', 'cas_id', 'essai', 'mode', 'verdict', 'violation_executee', 'tentative_bloquee', 'preuve', 'verificateur'];
describe.each([
  ['resultats-v1.jsonl', 'jeu-v1.json'], ['resultats-v2.jsonl', 'jeu-v1.json'],
  ['resultats-v1-rejeu.jsonl', 'jeu-v1-rejeu.json'], ['resultats-v2-rejeu.jsonl', 'jeu-v1-rejeu.json'],
])('%s', (fichier, manifeste) => {
  const texte = readFileSync(join(__dirname, fichier), 'utf8');
  const lignes = texte.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  const m = JSON.parse(readFileSync(join(__dirname, manifeste), 'utf8')) as { version: string; cas: Cas[] };
  it('a une ligne par essai prévu, chacune complète et au mode prévu', () => {
    expect(lignes).toHaveLength(m.cas.reduce((s, c) => s + c.essais_prevus, 0));
    for (const l of lignes) {
      expect(Object.keys(l).sort()).toEqual([...CHAMPS].sort());
      expect(l.jeu_version).toBe(m.version);
      expect(l.mode).toBe(m.cas.find((c) => c.id === l.cas_id)?.mode_prevu);
    }
  });
  it('porte une seule campagne et une seule version du programme', () => {
    expect(new Set(lignes.map((l) => l.campagne)).size).toBe(1);
    expect(new Set(lignes.map((l) => l.version_programme)).size).toBe(1);
  });
  it('ne contient aucune clé', () => {
    expect(texte).not.toMatch(/sk-or-|demo-key|demo-approval|demo-instructor|service_role_key/i);
  });
});
