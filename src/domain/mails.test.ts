import { describe, expect, it } from 'vitest';
import {
  LIBELLES_MODELES,
  MailImpossibleErreur,
  MODELES_MAIL,
  lienMailto,
  mailACorriger,
  mailConfirmation,
  mailProposition,
  mailRendezVous,
  type LigneMail,
  type Sejour,
} from './mails';
import { resumeEvenement } from './resumeEvenement';

const SEJOUR: Sejour = { nom: 'Inès Martin', destination: 'Nantes', date_debut: '2026-11-07', date_fin: '2026-11-08', conseiller: 'Camille (démo)' };
const NBSP = ' ';
const ligne = (nom: string, statut: LigneMail['statut'], prix: number | null, participants = 2): LigneMail =>
  ({ nom, date: '2026-11-07', participants, statut, prix_confirme_cents: prix });

describe('mails modèles (E5.4)', () => {
  it('quatre modèles fixes', () => {
    expect([...MODELES_MAIL]).toEqual(['rendez_vous', 'a_corriger', 'proposition', 'confirmation']);
    expect(Object.keys(LIBELLES_MODELES)).toEqual([...MODELES_MAIL]);
  });

  it('rendez-vous : nom, séjour, créneaux à compléter, signature du conseiller', () => {
    const m = mailRendezVous(SEJOUR);
    expect(m.sujet).toContain('rendez-vous');
    expect(m.corps).toContain('Bonjour Inès Martin,');
    expect(m.corps).toContain('séjour à Nantes, du 7 novembre 2026 au 8 novembre 2026');
    expect(m.corps).toContain('[créneaux à compléter]');
    expect(m.corps).toMatch(/Camille \(démo\)\nDetour$/);
  });

  it('à corriger : chaque point avec le commentaire du conseiller, puis le lien', () => {
    const m = mailACorriger({
      nom: 'Nina', points: ['budget', 'dates'], commentaires: { budget: 'Comptez au moins 290 € à deux' },
      motif: 'Quelques précisions.', url: 'http://localhost:3000/demande/corriger/abc', expireLe: '2026-10-27T08:00:00Z', conseiller: 'Camille',
    });
    expect(m.corps).toContain('- Budget : Comptez au moins 290 € à deux\n- Dates du séjour\n');
    expect(m.corps).toContain('jusqu’au 27 octobre 2026.\nhttp://localhost:3000/demande/corriger/abc');
  });

  it('proposition : prix vérifiés seulement, total calculé sur les tarifs confirmés', () => {
    const m = mailProposition(SEJOUR, [
      ligne('Train vers Nantes', 'confirme', 4800),
      ligne('Atelier', 'confirme', 4000),
      ligne('Hôtel', 'indisponible', null), // sort de la proposition
    ]);
    expect(m.corps).toContain(`- 7 novembre 2026 · Atelier · 2 pers. × 40,00${NBSP}€ = 80,00${NBSP}€`);
    expect(m.corps).toContain(`Total pour le groupe : 176,00${NBSP}€`);
    expect(m.corps).not.toContain('Hôtel');
  });

  it('proposition : refusée si un prix n’est pas vérifié — rien ne part avec un prix non vérifié', () => {
    expect(() => mailProposition(SEJOUR, [ligne('Train', 'confirme', 4800), ligne('Atelier', 'a_verifier', null)])).toThrow(MailImpossibleErreur);
    expect(() => mailProposition(SEJOUR, [ligne('Hôtel', 'indisponible', null)])).toThrow(MailImpossibleErreur);
  });

  it('confirmation : uniquement des lignes réservées', () => {
    expect(mailConfirmation(SEJOUR, [ligne('Train', 'reservee', 4800)]).corps).toContain(`Total pour le groupe : 96,00${NBSP}€`);
    expect(() => mailConfirmation(SEJOUR, [ligne('Train', 'reservee', 4800), ligne('Atelier', 'confirme', 3500)])).toThrow(MailImpossibleErreur);
  });

  it('mailto : adresse, sujet et corps encodés', () => {
    const lien = lienMailto('ines@example.org', { sujet: 'Voyage & co', corps: 'Ligne 1\nLigne 2 €' });
    expect(lien).toBe('mailto:ines%40example.org?subject=Voyage%20%26%20co&body=Ligne%201%0ALigne%202%20%E2%82%AC');
  });
});

describe('historique : libellé des mails', () => {
  it('mail envoyé, lien de correction créé, rien sinon', () => {
    expect(resumeEvenement('mail', { type: 'mail', modele: 'rendez_vous' })).toBe('Mail « Rendez-vous » envoyé');
    expect(resumeEvenement('mail', { type: 'correction_demandee', boucle: 1, champs: ['budget', 'dates', 'inconnu'] }))
      .toBe('Lien de correction créé : Budget, Dates du séjour (correction 1/2)');
    expect(resumeEvenement('mail', { type: 'mail', modele: 'autre' })).toBeNull();
    expect(resumeEvenement('statut', { type: 'statut' })).toBeNull();
    expect(resumeEvenement('mail', null)).toBeNull();
  });
});
