import { describe, expect, it } from 'vitest';
import { estProtege, suiteSure, urlConnexion } from './redirection';

describe('protection de /conseiller', () => {
  it('protège /conseiller et ses sous-pages, pas le reste', () => {
    expect(estProtege('/conseiller')).toBe(true);
    expect(estProtege('/conseiller/dossiers/42')).toBe(true);
    expect(estProtege('/conseillers')).toBe(false);
    expect(estProtege('/connexion')).toBe(false);
    expect(estProtege('/demande')).toBe(false);
    expect(estProtege('/')).toBe(false);
  });

  it('envoie vers la page de connexion en gardant la page demandée', () => {
    expect(urlConnexion('/conseiller/dossiers/42?onglet=fiche')).toBe(
      '/connexion?suite=%2Fconseiller%2Fdossiers%2F42%3Fonglet%3Dfiche',
    );
  });
});

describe('retour après connexion', () => {
  it('revient sur la page de l’espace conseiller demandée', () => {
    expect(suiteSure('/conseiller/dossiers/42?onglet=fiche')).toBe('/conseiller/dossiers/42?onglet=fiche');
  });

  it('ramène à /conseiller par défaut et pour tout chemin hors de l’espace conseiller', () => {
    for (const suite of [
      null,
      undefined,
      '',
      'https://ailleurs.example',
      '//ailleurs.example/conseiller',
      '/\\ailleurs.example',
      '/demande',
      '/conseillers',
    ]) {
      expect(suiteSure(suite), String(suite)).toBe('/conseiller');
    }
  });
});
