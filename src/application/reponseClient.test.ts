import { describe, expect, it } from 'vitest';
import type { StatutProposition } from '../../types';
import { DejaAccepteeErreur, type ReponseClientRepository } from '../ports/reponseClient';
import { StatutModifieErreur } from '../ports/statuts';
import { enregistrerReponse } from './reponseClient';

/** Même règles que enregistrer_reponse_client : une seule proposition acceptée par dossier. */
class ReponsesEnMemoire implements ReponseClientRepository {
  readonly journal: string[] = [];
  constructor(readonly propositions: Map<string, { dossier: string; statut: StatutProposition }>) {}
  async lireStatut(id: string) {
    return this.propositions.get(id)?.statut ?? null;
  }
  async enregistrer(id: string, nouveau: 'acceptee' | 'depot_recu', conseillerId: string) {
    const p = this.propositions.get(id)!;
    const attendu = nouveau === 'acceptee' ? ['envoyee', 'sans_reponse'] : ['acceptee'];
    if (!attendu.includes(p.statut)) throw new StatutModifieErreur(attendu[0]!, p.statut);
    if (nouveau === 'acceptee' && [...this.propositions].some(([autre, q]) => autre !== id && q.dossier === p.dossier && ['acceptee', 'depot_recu', 'reservee'].includes(q.statut))) {
      throw new DejaAccepteeErreur(p.dossier);
    }
    this.journal.push(`${p.statut}>${nouveau} par ${conseillerId}`);
    p.statut = nouveau;
  }
}

const repo = (statut: StatutProposition = 'envoyee') => new ReponsesEnMemoire(new Map([['p1', { dossier: 'd1', statut }], ['p2', { dossier: 'd1', statut: 'envoyee' }]]));
const reponse = (r: ReponsesEnMemoire, rep: 'acceptee' | 'depot_recu', p = 'p1', confirme = true) =>
  enregistrerReponse(r, { propositionId: p, reponse: rep, conseillerId: 'alice', confirme });

describe('acceptation du client puis dépôt reçu (E7.1)', () => {
  it('deux clics : envoyee → acceptee → depot_recu, journalisés au nom du conseiller', async () => {
    const r = repo();
    expect(await reponse(r, 'acceptee')).toEqual({ ok: true });
    expect(await reponse(r, 'depot_recu')).toEqual({ ok: true });
    expect(r.propositions.get('p1')!.statut).toBe('depot_recu');
    expect(r.journal).toEqual(['envoyee>acceptee par alice', 'acceptee>depot_recu par alice']);
  });

  it('demande une confirmation explicite', async () => {
    const r = repo();
    expect(await reponse(r, 'acceptee', 'p1', false)).toEqual({ ok: false, raison: 'non_confirme' });
    expect(r.journal).toEqual([]);
  });

  it('refuse le dépôt avant l’acceptation, et toute réponse sur une proposition non envoyée', async () => {
    expect(await reponse(repo(), 'depot_recu')).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(await reponse(repo('prete'), 'acceptee')).toEqual({ ok: false, raison: 'transition_interdite' });
    expect(await reponse(repo('depot_recu'), 'depot_recu')).toEqual({ ok: false, raison: 'transition_interdite' });
  });

  it('une seule proposition acceptée par dossier', async () => {
    const r = repo();
    await reponse(r, 'acceptee', 'p1');
    expect(await reponse(r, 'acceptee', 'p2')).toEqual({ ok: false, raison: 'deja_acceptee' });
    expect(r.propositions.get('p2')!.statut).toBe('envoyee');
  });

  it('signale une proposition inconnue', async () => {
    expect(await reponse(repo(), 'acceptee', 'p9')).toEqual({ ok: false, raison: 'introuvable' });
  });
});
