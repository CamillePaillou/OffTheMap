import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Identité DÉTOUR (app/globals.css) : les couleurs posées sous du texte gardent un contraste suffisant (WCAG AA).
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

describe('couleurs DÉTOUR', () => {
  it.each(['detour-nuit', 'detour-lien', 'detour-orange-fonce', 'detour-texte', 'detour-doux'])(
    '%s : texte normal lisible sur blanc, sur le fond et sur l’aplat ciel (≥ 4,5:1)',
    (nom) => {
      for (const fond of ['#ffffff', couleur('detour-fond'), couleur('detour-ciel')])
        expect(contraste(couleur(nom), fond)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it('boutons : texte blanc lisible sur le bleu nuit et sur l’orange foncé', () => {
    expect(contraste('#ffffff', couleur('detour-nuit'))).toBeGreaterThanOrEqual(4.5);
    expect(contraste('#ffffff', couleur('detour-orange-fonce'))).toBeGreaterThanOrEqual(4.5);
  });
  it('l’orange vif et le bleu du logo ne servent qu’aux traits et repères : trop clairs pour du texte', () => {
    expect(contraste('#ffffff', couleur('detour-orange'))).toBeLessThan(4.5);
    expect(contraste('#ffffff', couleur('detour-bleu'))).toBeLessThan(4.5);
  });
  it('« la ligne » reste visible : la station remplie se distingue du blanc (≥ 3:1, élément graphique)', () => {
    expect(contraste(couleur('detour-bleu'), '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(contraste(couleur('detour-orange'), '#ffffff')).toBeGreaterThanOrEqual(2);
  });
});
