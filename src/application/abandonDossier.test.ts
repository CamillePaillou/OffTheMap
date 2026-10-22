import { describe, expect, it } from 'vitest';
import { abandonPropose } from '../domain/rappels';
import { AbandonEnMemoire } from '../infrastructure/db/abandonEnMemoire';
import type { PropositionAAbandonner } from '../ports/abandon';
import { StatutModifieErreur } from '../ports/statuts';
import { abandonnerDossier } from './abandonDossier';

const ENVOI = '2026-10-01T09:00:00Z';
const J14 = new Date('2026-10-15T09:00:00Z');
const demande = { propositionId: 'p1', conseillerId: 'alice', confirme: true };

const depot = (p: Partial<PropositionAAbandonner> = {}) => {
  const repo = new AbandonEnMemoire();
  repo.propositions.set('p1', { statut: 'sans_reponse', envoyee_le: ENVOI, dossier_statut: 'en_proposition', ...p });
  return repo;
};

describe('abandon proposé (E6.5)', () => {
  it('à partir de J+14 pleins, sur une proposition sans réponse seulement', () => {
    expect(abandonPropose({ statut: 'sans_reponse', envoyee_le: ENVOI }, new Date('2026-10-15T08:59:59Z'))).toBe(false);
    expect(abandonPropose({ statut: 'sans_reponse', envoyee_le: ENVOI }, J14)).toBe(true);
    expect(abandonPropose({ statut: 'envoyee', envoyee_le: ENVOI }, J14)).toBe(false);
    expect(abandonPropose({ statut: 'sans_reponse', envoyee_le: null }, J14)).toBe(false);
  });
});

describe('abandonner un dossier sans réponse (E6.5)', () => {
  it('après confirmation, le dossier passe à abandonnee au nom du conseiller', async () => {
    const repo = depot();
    expect(await abandonnerDossier(repo, demande, J14)).toEqual({ ok: true });
    expect(repo.propositions.get('p1')).toMatchObject({ statut: 'sans_reponse', dossier_statut: 'abandonnee' });
    expect(repo.journal).toEqual(['p1:en_proposition>abandonnee par alice']);
  });

  it('rien sans la case de confirmation', async () => {
    const repo = depot();
    expect(await abandonnerDossier(repo, { ...demande, confirme: false }, J14)).toEqual({ ok: false, raison: 'non_confirme' });
    expect(repo.journal).toEqual([]);
  });

  it('rien avant J+14', async () => {
    const repo = depot();
    expect(await abandonnerDossier(repo, demande, new Date('2026-10-14T09:00:00Z'))).toEqual({ ok: false, raison: 'trop_tot' });
    expect(repo.journal).toEqual([]);
  });

  it.each([
    ['une proposition acceptée', { statut: 'acceptee' as const }],
    ['une proposition remplacée', { statut: 'remplacee' as const }],
    ['un dossier déjà abandonné', { dossier_statut: 'abandonnee' as const }],
    ['un dossier gagné', { dossier_statut: 'gagnee' as const }],
  ])('refuse depuis %s', async (_, p) => {
    const repo = depot(p);
    expect(await abandonnerDossier(repo, demande, J14)).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(repo.journal).toEqual([]);
  });

  it('refuse sans conseiller identifié, ou sur une proposition inconnue', async () => {
    expect(await abandonnerDossier(depot(), { ...demande, conseillerId: ' ' }, J14)).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(await abandonnerDossier(depot(), { ...demande, propositionId: 'p9' }, J14)).toEqual({ ok: false, raison: 'introuvable' });
  });

  it('signale une réponse du client enregistrée entre-temps', async () => {
    const repo = new (class extends AbandonEnMemoire {
      async abandonner(): Promise<void> {
        throw new StatutModifieErreur('sans_reponse', 'acceptee');
      }
    })();
    repo.propositions.set('p1', { statut: 'sans_reponse', envoyee_le: ENVOI, dossier_statut: 'en_proposition' });
    expect(await abandonnerDossier(repo, demande, J14)).toEqual({ ok: false, raison: 'statut_modifie' });
  });
});
