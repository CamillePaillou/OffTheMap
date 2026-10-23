import { describe, expect, it } from 'vitest';
import { resumeEvenement } from './resumeEvenement';

describe('resumeEvenement : événements d’option (E7.4)', () => {
  it('distingue la pose, la confirmation et l’annulation, réussies ou non', () => {
    expect(resumeEvenement('option', { type: 'option', ok: true })).toBe('Option posée chez le prestataire');
    expect(resumeEvenement('option', { type: 'option', ok: false, raison: 'simulateur_refus' })).toBe('Pose de l’option échouée');
    expect(resumeEvenement('option', { type: 'confirmation', ok: false })).toBe('Confirmation de la réservation échouée');
    expect(resumeEvenement('option', { type: 'annulation', ok: true })).toBe('Réservation annulée chez le prestataire');
    expect(resumeEvenement('option', { type: 'annulation', ok: false })).toBe('Annulation de la réservation échouée');
  });

  it('signale les tentatives refusées avant tout envoi', () => {
    expect(resumeEvenement('option', { type: 'tentative_refusee', raison: 'accord_absent_ou_expire' })).toBe('Pose de l’option refusée avant envoi');
    expect(resumeEvenement('option', { type: 'tentative_confirmation', raison: 'cle_absente' })).toBe('Confirmation refusée avant envoi');
    expect(resumeEvenement('option', { type: 'tentative_annulation', raison: 'confirmation_absente' })).toBe('Annulation refusée avant envoi');
  });

  it('laisse le libellé générique pour un détail inconnu', () => {
    expect(resumeEvenement('option', { type: 'autre' })).toBeNull();
    expect(resumeEvenement('option', null)).toBeNull();
  });
});

describe('resumeEvenement : changement de prestation après le dépôt (E7.4)', () => {
  it('signale le remplacement et le retrait, acceptés par le client', () => {
    expect(resumeEvenement('changement', { type: 'remplacement', accord_client: true })).toBe('Prestation indisponible remplacée, avec l’accord du client');
    expect(resumeEvenement('changement', { type: 'retrait', accord_client: true })).toBe('Prestation indisponible retirée, avec l’accord du client');
  });
  it('laisse le libellé générique pour une nouvelle version demandée par le client (E6.1)', () => {
    expect(resumeEvenement('changement', { type: 'changement', version_remplacee: 1, nouvelle_version: 2 })).toBeNull();
  });
});
