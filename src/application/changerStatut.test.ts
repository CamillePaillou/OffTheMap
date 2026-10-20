import { beforeEach, describe, expect, it } from 'vitest';
import { verifierTransition } from '../domain/transition';
import { StatutsEnMemoire } from '../infrastructure/db/statutsEnMemoire';
import { StatutModifieErreur, type EcritureTransition } from '../ports/statuts';
import { changerStatut } from './changerStatut';

const SYSTEME = { type: 'systeme' } as const;
const ALICE = { type: 'conseiller', id: 'alice' } as const;

let repo: StatutsEnMemoire;
beforeEach(() => {
  repo = new StatutsEnMemoire();
  repo.dossiers.set('d1', { statut: 'fiche_prete' });
  repo.propositions.set('p1', { statut: 'prete', dossier_id: 'd1' });
});

describe('changerStatut', () => {
  it('écrit le statut et une ligne d’historique', async () => {
    const r = await changerStatut(repo, { cible: 'dossier', id: 'd1', vers: 'validee', auteur: ALICE });
    expect(r).toEqual({ ok: true, ancien: 'fiche_prete', nouveau: 'validee', historiqueId: '1' });
    expect(repo.dossiers.get('d1')!.statut).toBe('validee');
    expect(repo.historique).toEqual([{
      id: '1', dossier_id: 'd1', proposition_id: null, type: 'statut', ancien_statut: 'fiche_prete', nouveau_statut: 'validee',
      auteur: 'conseiller', auteur_id: 'alice',
      detail: { type: 'statut', cible: 'dossier', ancien: 'fiche_prete', nouveau: 'validee', decision: 'validee' },
    }]);
  });

  it('crée une ligne d’historique par transition', async () => {
    await changerStatut(repo, { cible: 'dossier', id: 'd1', vers: 'validee', auteur: ALICE });
    await changerStatut(repo, { cible: 'dossier', id: 'd1', vers: 'rdv_propose', auteur: ALICE });
    await changerStatut(repo, { cible: 'dossier', id: 'd1', vers: 'entretien_fait', auteur: ALICE });
    expect(repo.historique.map((h) => `${h.ancien_statut}>${h.nouveau_statut}`))
      .toEqual(['fiche_prete>validee', 'validee>rdv_propose', 'rdv_propose>entretien_fait']);
  });

  it('rattache la transition d’une proposition à son dossier', async () => {
    const r = await changerStatut(repo, { cible: 'proposition', id: 'p1', vers: 'envoyee', auteur: ALICE });
    expect(r.ok).toBe(true);
    expect(repo.historique[0]).toMatchObject({ dossier_id: 'd1', proposition_id: 'p1', nouveau_statut: 'envoyee' });
  });

  it.each([
    ['absente de la matrice', { cible: 'dossier', id: 'd1', vers: 'gagnee', auteur: ALICE }, 'transition_interdite'],
    ['faite par le mauvais auteur', { cible: 'dossier', id: 'd1', vers: 'validee', auteur: SYSTEME }, 'transition_interdite'],
    ['faite par un conseiller sans identifiant', { cible: 'dossier', id: 'd1', vers: 'validee', auteur: { type: 'conseiller', id: ' ' } }, 'auteur_non_identifie'],
    ['sur un dossier inexistant', { cible: 'dossier', id: 'd9', vers: 'validee', auteur: ALICE }, 'introuvable'],
  ] as const)('refuse une transition %s, sans rien écrire', async (_, demande, raison) => {
    expect(await changerStatut(repo, demande)).toEqual({ ok: false, raison });
    expect(repo.dossiers.get('d1')!.statut).toBe('fiche_prete');
    expect(repo.historique).toHaveLength(0);
  });

  it('refuse une transition de la matrice pas encore livrée (should)', async () => {
    repo.propositions.set('p1', { statut: 'envoyee', dossier_id: 'd1' });
    const r = await changerStatut(repo, { cible: 'proposition', id: 'p1', vers: 'changement_demande', auteur: ALICE });
    expect(r).toEqual({ ok: false, raison: 'transition_non_livree' });
    expect(repo.historique).toHaveLength(0);
  });

  it('refuse si le statut a changé entre la lecture et l’écriture', async () => {
    const concurrent = new (class extends StatutsEnMemoire {
      async appliquerTransition<C extends 'dossier' | 'proposition'>(e: EcritureTransition<C>): Promise<string> {
        throw new StatutModifieErreur(e.ancien, 'refusee');
      }
    })();
    concurrent.dossiers.set('d1', { statut: 'fiche_prete' });
    expect(await changerStatut(concurrent, { cible: 'dossier', id: 'd1', vers: 'validee', auteur: ALICE }))
      .toEqual({ ok: false, raison: 'statut_modifie' });
  });
});

describe('verifierTransition', () => {
  it('ne note une décision de tri que depuis une fiche prête', () => {
    const v = verifierTransition('dossier', 'a_corriger', 'validee', ALICE);
    expect(v.ok && v.detail).toEqual({ type: 'statut', cible: 'dossier', ancien: 'a_corriger', nouveau: 'validee' });
  });
  it('accepte une priorité livrée quand on la fournit', () => {
    expect(verifierTransition('proposition', 'envoyee', 'changement_demande', ALICE, ['must', 'should']).ok).toBe(true);
  });
});
