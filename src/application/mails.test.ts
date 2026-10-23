import { describe, expect, it } from 'vitest';
import type { ModeleMail } from '../domain/mails';
import { MailSansObjetErreur, type MailsRepository } from '../ports/mails';
import { marquerMailEnvoye } from './mails';

class MailsEnMemoire implements MailsRepository {
  readonly journal: { dossierId: string; propositionId: string | null; modele: ModeleMail; conseillerId: string }[] = [];
  constructor(private readonly refuser = false) {}
  async marquerEnvoye(e: MailsEnMemoire['journal'][number]) {
    if (this.refuser) throw new MailSansObjetErreur('OT010');
    this.journal.push(e);
  }
}

describe('marquer un mail envoyé (E5.4)', () => {
  it('journalise le modèle, au nom du conseiller', async () => {
    const repo = new MailsEnMemoire();
    expect(await marquerMailEnvoye(repo, { dossierId: 'd1', propositionId: 'p1', modele: 'rendez_vous', conseillerId: 'alice' })).toEqual({ ok: true });
    // le rendez-vous porte sur le dossier : la proposition n'est pas retenue
    expect(repo.journal).toEqual([{ dossierId: 'd1', propositionId: null, modele: 'rendez_vous', conseillerId: 'alice' }]);
  });

  it('exige la proposition pour les mails de proposition et de confirmation', async () => {
    const repo = new MailsEnMemoire();
    expect(await marquerMailEnvoye(repo, { dossierId: 'd1', propositionId: null, modele: 'proposition', conseillerId: 'alice' })).toEqual({ ok: false, raison: 'sans_objet' });
    expect(await marquerMailEnvoye(repo, { dossierId: 'd1', propositionId: 'p1', modele: 'confirmation', conseillerId: 'alice' })).toEqual({ ok: true });
    expect(repo.journal).toHaveLength(1);
  });

  it('refuse un modèle inconnu, ou un mail sans objet à cette étape', async () => {
    expect(await marquerMailEnvoye(new MailsEnMemoire(), { dossierId: 'd1', propositionId: null, modele: 'relance', conseillerId: 'alice' })).toEqual({ ok: false, raison: 'modele_inconnu' });
    expect(await marquerMailEnvoye(new MailsEnMemoire(true), { dossierId: 'd1', propositionId: null, modele: 'a_corriger', conseillerId: 'alice' })).toEqual({ ok: false, raison: 'sans_objet' });
  });
});
