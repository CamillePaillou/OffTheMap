import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Charte DÉTOUR 2026 (app/globals.css) : une seule identité pour le site et l'espace conseiller. Les couleurs posées
// sous du texte gardent un contraste suffisant (WCAG AA) ; le jaune n'est jamais du texte sur fond clair.
const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8');
const couleur = (nom: string) => {
  const m = css.match(new RegExp(`--${nom}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!m) throw new Error(`--${nom} absent de globals.css`);
  return m[1]!;
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contraste = (a: string, b: string) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};

const CRAIE = () => couleur('detour-craie');
const FONDS_CLAIRS = () => [CRAIE(), couleur('detour-carte'), couleur('detour-ciel-pale'), '#ffffff'];

describe('charte DÉTOUR 2026', () => {
  it('les six couleurs de la charte, à la valeur du brief', () => {
    expect(['encre', 'craie', 'jaune', 'ciel', 'brique', 'ballast'].map((n) => couleur(`detour-${n}`).toUpperCase())).toEqual([
      '#16233F', '#F6F1E7', '#F2B705', '#BCD3EA', '#C4553A', '#6B7385',
    ]);
  });

  it.each(['detour-encre', 'detour-encre-doux'])('%s : texte lisible sur la craie, les cartes et la sélection (≥ 4,5:1)', (nom) => {
    for (const fond of FONDS_CLAIRS()) expect(contraste(couleur(nom), fond)).toBeGreaterThanOrEqual(4.5);
  });

  it('encre lisible sur le ciel (fonds secondaires, valeur « Exactitude », pastilles)', () => {
    expect(contraste(couleur('detour-encre'), couleur('detour-ciel'))).toBeGreaterThanOrEqual(4.5);
  });

  it('brique : en texte, sa version assombrie, lisible sur la craie et sur le fond d’alerte', () => {
    for (const fond of [CRAIE(), couleur('detour-carte'), couleur('detour-brique-pale')])
      expect(contraste(couleur('detour-brique-texte'), fond)).toBeGreaterThanOrEqual(4.5);
  });

  it('boutons : craie sur encre et sur son survol ; craie sur l’aplat encre du pied de page', () => {
    expect(contraste(CRAIE(), couleur('detour-encre'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(CRAIE(), couleur('detour-encre-clair'))).toBeGreaterThanOrEqual(4.5);
  });

  it('le jaune n’est jamais une couleur de texte sur fond clair (1,9:1), mais tient sur l’encre (logo en négatif)', () => {
    expect(contraste(couleur('detour-jaune'), CRAIE())).toBeLessThan(3);
    expect(contraste(couleur('detour-jaune'), couleur('detour-encre'))).toBeGreaterThanOrEqual(4.5);
  });

  it('écart justifié : le ballast de la charte (4,2:1 sur craie) ne sert pas au texte courant, encre-doux le remplace', () => {
    expect(contraste(couleur('detour-ballast'), CRAIE())).toBeLessThan(4.5);
    expect(contraste(couleur('detour-encre-doux'), CRAIE())).toBeGreaterThanOrEqual(4.5);
  });

  // pastilles de statut (types/statuts-famille.ts) : texte de 13 px, donc AA texte normal (RGAA 3.2)
  it.each([
    ['moi', 'detour-craie', 'detour-encre'],
    ['client', 'detour-orange-texte', 'detour-orange-pale'],
    ['valide', 'detour-vert-texte', 'detour-vert-pale'],
    ['conclue', 'detour-craie', 'detour-vert'],
    ['erreur', 'detour-craie', 'detour-rouge'],
    ['auto', 'detour-encre-doux', 'detour-ciel-pale'],
    ['proposition', 'detour-encre', 'detour-ciel'],
    ['clos (sur la carte)', 'detour-encre-doux', 'detour-carte'],
    ['clos (sur la craie)', 'detour-encre-doux', 'detour-craie'],
  ])('pastille %s : texte lisible (≥ 4,5:1)', (_, texte, fond) => {
    expect(contraste(couleur(texte), couleur(fond))).toBeGreaterThanOrEqual(4.5);
  });

  it('« la ligne » et les traits restent visibles : l’encre sur la craie (≥ 3:1, élément graphique)', () => {
    expect(contraste(couleur('detour-encre'), CRAIE())).toBeGreaterThanOrEqual(3);
  });
});

describe('le jaune reste rare', () => {
  // un accent par écran : le O du logo et le saut typographique. Aucun aplat, texte ou bordure jaune ailleurs.
  const sources = execSync("git ls-files 'app/**/*.tsx'", { encoding: 'utf8' }).trim().split('\n');
  it.each(sources)('%s : pas de jaune hors du logo et du saut', (fichier) => {
    const code = readFileSync(join(__dirname, '..', fichier), 'utf8');
    expect(code).not.toMatch(/(?:text|bg|border|ring|fill|stroke|outline|decoration)-jaune|#f2b705/i);
  });

  it('aucune couleur en dur dans les écrans : tout passe par les jetons de la charte', () => {
    for (const fichier of sources) {
      const code = readFileSync(join(__dirname, '..', fichier), 'utf8');
      expect(code.match(/#[0-9a-f]{6}\b/gi) ?? [], fichier).toEqual([]);
    }
  });

  it('dans globals.css, le jaune ne sert qu’au saut et au focus sur l’encre (jamais le focus sur fond clair)', () => {
    const usages = css.split('\n').filter((l) => l.includes('var(--detour-jaune)') && !l.trim().startsWith('--'));
    expect(usages.map((l) => l.trim())).toEqual(['outline-color: var(--detour-jaune);', 'color: var(--detour-jaune);']);
    expect(css).toMatch(/:focus-visible \{\s*outline: 3px solid var\(--detour-encre\)/);
    expect(css).toMatch(/\.sur-encre :focus-visible,\s*\.sur-encre:focus-visible \{\s*outline-color: var\(--detour-jaune\)/);
  });

  it('au plus un saut typographique par page', () => {
    for (const fichier of sources.filter((f) => f.endsWith('page.tsx'))) {
      const code = readFileSync(join(__dirname, '..', fichier), 'utf8');
      expect((code.match(/<Saut\b/g) ?? []).length, fichier).toBeLessThanOrEqual(1);
    }
  });
});
