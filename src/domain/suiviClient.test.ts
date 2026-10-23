import { describe, expect, it } from 'vitest';
import { STATUTS_DOSSIER, STATUTS_PROPOSITION } from '../../types/enums';
import { ETAPES_CLIENT, normaliserReference, peutRepondre, suiviClient } from './suiviClient';

describe('suivi de la demande côté client', () => {
  it.each([
    ['nouvelle', null, 0],
    ['fiche_en_cours', null, 1],
    ['erreur', null, 1], // une fiche en erreur reste interne : le client voit l'étude
    ['validee', null, 1],
    ['rdv_propose', null, 1],
    ['en_proposition', 'brouillon_en_cours', 2],
    ['en_proposition', 'a_verifier', 2],
    ['en_proposition', 'prete', 2],
    ['en_proposition', 'envoyee', 3],
    ['en_proposition', 'sans_reponse', 3],
    ['en_proposition', 'changement_demande', 2],
    ['en_proposition', 'acceptee', 4],
    ['en_proposition', 'depot_recu', 4],
    ['en_proposition', 'reservee', 5],
    ['gagnee', 'reservee', 5],
  ] as const)('%s / %s : étape %i', (dossier, proposition, etape) => {
    expect(suiviClient(dossier, proposition)).toMatchObject({ etape, arret: null });
  });

  it('les cas hors ligne : à compléter, non retenue, clos', () => {
    expect(suiviClient('a_corriger', null)).toMatchObject({ etape: 1, arret: 'a_completer' });
    expect(suiviClient('refusee', null)).toMatchObject({ etape: 1, arret: 'non_retenue' });
    expect(suiviClient('abandonnee', 'sans_reponse')).toMatchObject({ etape: 3, arret: 'clos' });
    expect(suiviClient('abandonnee', null)).toMatchObject({ etape: 1, arret: 'clos' });
  });

  it('chaque combinaison donne une étape de la ligne et une phrase, sans vocabulaire interne', () => {
    for (const d of STATUTS_DOSSIER)
      for (const p of [null, ...STATUTS_PROPOSITION]) {
        const s = suiviClient(d, p);
        expect(s.etape).toBeGreaterThanOrEqual(0);
        expect(s.etape).toBeLessThan(ETAPES_CLIENT.length);
        expect(s.message).toMatch(/\.$/);
        expect(s.message).not.toMatch(/fiche|IA|brouillon|alerte|erreur|agent/i);
      }
  });

  it('réponse en ligne : seulement sur une proposition envoyée, une fois', () => {
    expect(peutRepondre('envoyee', false)).toBe(true);
    expect(peutRepondre('sans_reponse', false)).toBe(true);
    expect(peutRepondre('envoyee', true)).toBe(false);
    expect(peutRepondre('acceptee', false)).toBe(false);
    expect(peutRepondre(null, false)).toBe(false);
  });

  it('numéro de dossier : casse, espaces et tirets libres', () => {
    expect(normaliserReference(' dt jade-nant ')).toBe('DT-JADE-NANT');
    expect(normaliserReference('jadenant')).toBe('DT-JADE-NANT');
    expect(normaliserReference('DT-JADE-NANT')).toBe('DT-JADE-NANT');
    expect(normaliserReference('DT-JADE')).toBeNull();
    expect(normaliserReference('')).toBeNull();
  });
});
