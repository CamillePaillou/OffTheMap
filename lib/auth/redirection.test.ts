import { describe, expect, it } from 'vitest';
import { estProtege, estProtegeClient, suiteClientSure, suiteSure, urlConnexion, urlConnexionClient } from './redirection';

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

describe('espace client (/compte)', () => {
  it('protège le compte et ses demandes, pas l’inscription, la connexion ni les liens du mail', () => {
    expect(estProtegeClient('/compte')).toBe(true);
    expect(estProtegeClient('/compte/demandes/42')).toBe(true);
    expect(estProtegeClient('/compte/nouveau-mot-de-passe')).toBe(true);
    for (const ouverte of ['/compte/connexion', '/compte/inscription', '/compte/mot-de-passe-oublie', '/compte/confirmer'])
      expect(estProtegeClient(ouverte)).toBe(false);
    expect(estProtegeClient('/comptes')).toBe(false);
    expect(estProtegeClient('/suivi')).toBe(false);
  });

  it('après connexion ou lien du mail : seulement une page du compte', () => {
    expect(suiteClientSure('/compte/demandes/42')).toBe('/compte/demandes/42');
    expect(suiteClientSure('/compte/nouveau-mot-de-passe')).toBe('/compte/nouveau-mot-de-passe');
    expect(suiteClientSure('https://ailleurs.example')).toBe('/compte');
    expect(suiteClientSure('//ailleurs.example/compte')).toBe('/compte');
    expect(suiteClientSure('/conseiller')).toBe('/compte');
    expect(suiteClientSure('/compte/connexion')).toBe('/compte');
    expect(suiteClientSure(undefined)).toBe('/compte');
    expect(urlConnexionClient('/compte/demandes/42')).toBe('/compte/connexion?suite=%2Fcompte%2Fdemandes%2F42');
  });
});
