import { describe, expect, it } from 'vitest';
import { ecartPrix, euros } from './ecartPrix';

const ligne = { prix_unitaire_catalogue_cents: 3500, participants: 2 };

describe('écart entre le prix proposé et le prix revérifié', () => {
  it('hausse : atelier proposé à 35 €, revérifié à 40 €', () => {
    expect(ecartPrix(ligne, { prix_unitaire_cents: 4000 })).toEqual({
      unitaire_cents: 500, total_cents: 1000, pourcentage: 14.3, sens: 'hausse',
    });
  });
  it('baisse', () => {
    expect(ecartPrix(ligne, { prix_unitaire_cents: 3000 })).toMatchObject({ unitaire_cents: -500, total_cents: -1000, sens: 'baisse' });
  });
  it('aucun écart', () => {
    expect(ecartPrix(ligne, { prix_unitaire_cents: 3500 })).toMatchObject({ unitaire_cents: 0, pourcentage: 0, sens: 'identique' });
  });
  it('rien à comparer quand la vérification a échoué', () => {
    expect(ecartPrix(ligne, { prix_unitaire_cents: null })).toBeNull();
  });
  it('pas de pourcentage sur un prix proposé gratuit', () => {
    expect(ecartPrix({ prix_unitaire_catalogue_cents: 0, participants: 3 }, { prix_unitaire_cents: 500 })).toMatchObject({
      total_cents: 1500, pourcentage: null, sens: 'hausse',
    });
  });
});

describe('affichage en euros', () => {
  const net = (t: string) => t.replace(/\s/g, ' ');
  it('formate en français, avec le signe sur demande', () => {
    expect(net(euros(4000))).toBe('40,00 €');
    expect(net(euros(500, true))).toBe('+5,00 €');
    expect(net(euros(-500, true))).toBe('-5,00 €');
  });
});
