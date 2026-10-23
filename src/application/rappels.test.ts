import { describe, expect, it } from 'vitest';
import { joursDepuis, rappelDu, type JourRappel } from '../domain/rappels';
import { resumeEvenement } from '../domain/resumeEvenement';
import { RappelsEnMemoire } from '../infrastructure/db/rappelsEnMemoire';
import { RappelConcurrentErreur } from '../ports/rappels';
import { rappelerSansReponse } from './rappels';

const ENVOI = '2026-10-15T09:00:00Z';
const le = (iso: string) => new Date(iso);

describe('rappel dû (E6.4)', () => {
  it('compte des jours pleins depuis l’envoi', () => {
    expect(joursDepuis(ENVOI, le('2026-10-18T08:59:59Z'))).toBe(2);
    expect(joursDepuis(ENVOI, le('2026-10-18T09:00:00Z'))).toBe(3);
  });

  it.each([
    ['avant J+3', '2026-10-18T08:59:59Z', [], null],
    ['à J+3', '2026-10-18T09:00:00Z', [], 3],
    ['J+3 déjà fait', '2026-10-20T09:00:00Z', [3], null],
    ['à J+7 après J+3', '2026-10-22T09:00:00Z', [3], 7],
    ['à J+8 sans aucun rappel : seulement J+7', '2026-10-23T09:00:00Z', [], 7],
    ['J+7 déjà fait', '2026-10-28T08:59:59Z', [3, 7], null],
    ['à J+14 après J+7 : abandon proposé (E6.5)', '2026-10-29T09:00:00Z', [3, 7], 14],
    ['J+14 déjà fait', '2026-11-20T09:00:00Z', [3, 7, 14], null],
  ] as const)('%s', (_, maintenant, faits, attendu) => {
    expect(rappelDu(ENVOI, faits, le(maintenant))).toBe(attendu);
  });
});

describe('rappeler le conseiller quand le client ne répond pas (E6.4)', () => {
  // même horloge pour le cas d'usage et le dépôt, qui refuse comme la base un rappel avant son jour
  let horloge = le(ENVOI);
  const rappeler = (repo: RappelsEnMemoire, maintenant: string) => rappelerSansReponse(repo, (horloge = le(maintenant)));
  const depot = () => {
    const repo = new RappelsEnMemoire(() => horloge);
    repo.propositions.set('p1', { statut: 'envoyee', envoyee_le: ENVOI, rappels: [] });
    return repo;
  };

  it('à J+3 : la proposition passe en sans_reponse avec un rappel J+3', async () => {
    const repo = depot();
    expect(await rappeler(repo, '2026-10-18T10:00:00Z')).toEqual([{ propositionId: 'p1', jour: 3 }]);
    expect(repo.propositions.get('p1')).toMatchObject({ statut: 'sans_reponse', rappels: [3] });
    expect(repo.journal).toEqual(['p1:envoyee>sans_reponse', 'p1:rappel J+3']);
  });

  it('à J+7 puis J+14 : un rappel chacun, sans changer le statut ; puis plus rien', async () => {
    const repo = depot();
    await rappeler(repo, '2026-10-18T10:00:00Z');
    expect(await rappeler(repo, '2026-10-19T10:00:00Z')).toEqual([]);
    expect(await rappeler(repo, '2026-10-22T10:00:00Z')).toEqual([{ propositionId: 'p1', jour: 7 }]);
    expect(await rappeler(repo, '2026-10-25T10:00:00Z')).toEqual([]);
    expect(await rappeler(repo, '2026-10-29T10:00:00Z')).toEqual([{ propositionId: 'p1', jour: 14 }]);
    expect(await rappeler(repo, '2026-11-10T10:00:00Z')).toEqual([]);
    expect(repo.journal).toEqual(['p1:envoyee>sans_reponse', 'p1:rappel J+3', 'p1:rappel J+7', 'p1:rappel J+14']);
    expect(repo.propositions.get('p1')!.statut).toBe('sans_reponse');
  });

  it('rien avant J+3, ni sur une proposition qui a reçu une réponse ou n’est pas envoyée', async () => {
    const repo = depot();
    repo.propositions.set('p2', { statut: 'acceptee', envoyee_le: ENVOI, rappels: [] });
    repo.propositions.set('p3', { statut: 'prete', envoyee_le: null, rappels: [] });
    expect(await rappeler(repo, '2026-10-17T10:00:00Z')).toEqual([]);
    expect(await rappeler(repo, '2026-10-27T10:00:00Z')).toEqual([{ propositionId: 'p1', jour: 7 }]);
    expect(repo.propositions.get('p1')!.statut).toBe('sans_reponse');
    expect(repo.propositions.get('p2')!.statut).toBe('acceptee');
  });

  it('ignore une réponse ou un rappel concurrent, sans bloquer les autres propositions', async () => {
    const repo = new (class extends RappelsEnMemoire {
      async enregistrerRappel(id: string, jour: JourRappel) {
        if (id === 'p1') throw new RappelConcurrentErreur('acceptée entre-temps');
        return super.enregistrerRappel(id, jour);
      }
    })(() => horloge);
    repo.propositions.set('p1', { statut: 'envoyee', envoyee_le: ENVOI, rappels: [] });
    repo.propositions.set('p2', { statut: 'envoyee', envoyee_le: ENVOI, rappels: [] });
    expect(await rappeler(repo, '2026-10-18T10:00:00Z')).toEqual([{ propositionId: 'p2', jour: 3 }]);
  });
});

describe('historique : libellé des rappels', () => {
  it('rappel J+3, J+7 et J+14 ; rien si le détail est incomplet', () => {
    expect(resumeEvenement('rappel', { type: 'rappel', jour: 3 })).toBe('Rappel J+3 : pas de réponse du client à la proposition');
    expect(resumeEvenement('rappel', { type: 'rappel', jour: 7 })).toBe('Rappel J+7 : pas de réponse du client à la proposition');
    expect(resumeEvenement('rappel', { type: 'rappel', jour: 14 })).toBe('Rappel J+14 : pas de réponse du client, abandon du dossier proposé');
    expect(resumeEvenement('rappel', { type: 'rappel' })).toBeNull();
  });
});
