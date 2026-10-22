import { describe, expect, it } from 'vitest';
import { PROPOSITION, PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { LigneProposition, Proposition } from '../../types/dashboard';
import { LIMITES } from '../../types/enums';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { donnerAccord } from './donnerAccord';

const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001' };
const TRAIN = '5a1e0000-0000-4000-8000-0000000000b1'; // confirmé, vérifié 48 € × 2
const HOTEL = '5a1e0000-0000-4000-8000-0000000000b2'; // indisponible
const ATELIER = '5a1e0000-0000-4000-8000-0000000000b3'; // confirmé, vérifié 40 € × 2
const NOW = new Date('2026-10-21T15:00:00Z');

const demande = (o: Partial<Parameters<typeof donnerAccord>[1]> = {}) => ({
  conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: TRAIN, prixAfficheCents: 9600, maintenant: NOW, ...o,
});

describe('donnerAccord', () => {
  it('enregistre un accord lié à la ligne, au conseiller et au prix, et le journalise', async () => {
    const repo = new AccordsEnMemoire();
    const r = await donnerAccord(repo, demande());
    expect(r).toMatchObject({ ok: true, prix_accorde_cents: 9600 });
    expect(repo.accords).toHaveLength(1);
    expect(repo.accords[0]).toMatchObject({
      ligne_id: TRAIN, accord_par: CONSEILLER.id, prix_accorde_cents: 9600, statut: 'accord_donne', accord_utilise: false,
    });
    expect(repo.historique[0]).toMatchObject({
      type: 'accord', auteur_id: CONSEILLER.id,
      detail: { type: 'accord', ligne_id: TRAIN, prix_accorde_cents: 9600 },
    });
  });

  it('l’accord expire après la durée fixée par l’équipe', async () => {
    const repo = new AccordsEnMemoire();
    const r = await donnerAccord(repo, demande());
    expect(r.ok && r.accord_expire_le).toBe(new Date(NOW.getTime() + LIMITES.dureeAccordMinutes * 60_000).toISOString());
    expect(repo.accordValable(TRAIN, NOW)).toBeDefined();
    expect(repo.accordValable(TRAIN, new Date(NOW.getTime() + (LIMITES.dureeAccordMinutes + 1) * 60_000))).toBeUndefined();
  });

  it('un accord expiré ne bloque plus la ligne : on peut en redonner un', async () => {
    const repo = new AccordsEnMemoire();
    await donnerAccord(repo, demande());
    const plusTard = new Date(NOW.getTime() + (LIMITES.dureeAccordMinutes + 1) * 60_000);
    expect((await donnerAccord(repo, demande({ maintenant: plusTard }))).ok).toBe(true);
  });

  it('refuse un second accord sur la même ligne (usage unique, une démarche à la fois)', async () => {
    const repo = new AccordsEnMemoire();
    await donnerAccord(repo, demande());
    expect(await donnerAccord(repo, demande())).toEqual({ ok: false, raison: 'demarche_en_cours' });
    expect(repo.accords).toHaveLength(1);
  });

  it('deux lignes différentes peuvent chacune avoir leur accord', async () => {
    const repo = new AccordsEnMemoire();
    expect((await donnerAccord(repo, demande())).ok).toBe(true);
    expect((await donnerAccord(repo, demande({ ligneId: ATELIER, prixAfficheCents: 8000 }))).ok).toBe(true);
    expect(repo.accords).toHaveLength(2);
  });

  it('refuse si le prix affiché n’est plus le prix revérifié, sans rien écrire', async () => {
    const repo = new AccordsEnMemoire();
    expect(await donnerAccord(repo, demande({ prixAfficheCents: 9000 }))).toEqual({ ok: false, raison: 'prix_modifie' });
    expect(repo.accords).toHaveLength(0);
    expect(repo.historique).toHaveLength(0);
  });

  it('refuse une ligne indisponible, en renvoyant au remplacement ou au retrait (E7.4)', async () => {
    const repo = new AccordsEnMemoire();
    expect(await donnerAccord(repo, demande({ ligneId: HOTEL, prixAfficheCents: 19200 }))).toEqual({ ok: false, raison: 'ligne_indisponible' });
    expect(repo.accords).toHaveLength(0);
  });

  it('refuse tant que la proposition n’est pas au dépôt reçu', async () => {
    const repo = new AccordsEnMemoire();
    expect(await donnerAccord(repo, demande({ proposition: PROPOSITION, ligneId: '5a1e0000-0000-4000-8000-0000000000b3', prixAfficheCents: 8000 })))
      .toEqual({ ok: false, raison: 'proposition_pas_au_depot' });
    expect(repo.accords).toHaveLength(0);
  });

  it('refuse sans vérification « ok » : aucun prix fiable', async () => {
    const repo = new AccordsEnMemoire();
    const echec: Proposition = {
      ...PROPOSITION_DEPOT_RECU,
      lignes: PROPOSITION_DEPOT_RECU.lignes.map((l): LigneProposition => l.id === TRAIN
        ? { ...l, derniere_verification: { statut: 'echec', prix_unitaire_cents: null, places_restantes: null, le: '2026-10-21T14:38:00Z' } }
        : l),
    };
    expect(await donnerAccord(repo, demande({ proposition: echec }))).toEqual({ ok: false, raison: 'verification_non_ok' });

    const absente: Proposition = {
      ...PROPOSITION_DEPOT_RECU,
      lignes: PROPOSITION_DEPOT_RECU.lignes.map((l): LigneProposition => (l.id === TRAIN ? { ...l, derniere_verification: null } : l)),
    };
    expect(await donnerAccord(repo, demande({ proposition: absente }))).toEqual({ ok: false, raison: 'verification_absente' });
    expect(repo.accords).toHaveLength(0);
  });

  it('refuse une ligne inconnue ou un conseiller non identifié', async () => {
    const repo = new AccordsEnMemoire();
    expect(await donnerAccord(repo, demande({ ligneId: 'inconnue' }))).toEqual({ ok: false, raison: 'ligne_introuvable' });
    expect(await donnerAccord(repo, demande({ conseiller: { id: ' ' } }))).toEqual({ ok: false, raison: 'conseiller_non_identifie' });
    expect(repo.accords).toHaveLength(0);
  });

  it('E11.2 (E02) : après une option posée à un autre prix, un nouvel accord attend une vérification postérieure', async () => {
    const repo = new AccordsEnMemoire();
    const premier = await donnerAccord(repo, demande());
    if (!premier.ok) throw new Error('accord attendu');
    await repo.consommerAccord(premier.option_id, NOW);
    await repo.terminerPoseOption(premier.option_id, { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: { prix_total_cents: 11000 } });

    expect(await donnerAccord(repo, demande())).toEqual({ ok: false, raison: 'prix_a_reverifier' });

    // la ligne est revérifiée après l'échec, au nouveau prix : l'accord redevient possible à ce prix
    const ligne = PROPOSITION_DEPOT_RECU.lignes.find((l) => l.id === TRAIN)!;
    const reverifiee: LigneProposition = { ...ligne, derniere_verification: { ...ligne.derniere_verification!, prix_unitaire_cents: 5500, le: new Date(Date.now() + 60_000).toISOString() } };
    const proposition: Proposition = { ...PROPOSITION_DEPOT_RECU, lignes: PROPOSITION_DEPOT_RECU.lignes.map((l) => (l.id === TRAIN ? reverifiee : l)) };
    expect(await donnerAccord(repo, demande({ proposition, prixAfficheCents: 11000 }))).toMatchObject({ ok: true, prix_accorde_cents: 11000 });
  });

  it('E11.2 (E02) : un échec de pose pour une autre raison (délai) n’exige pas de revérification', async () => {
    const repo = new AccordsEnMemoire();
    const premier = await donnerAccord(repo, demande());
    if (!premier.ok) throw new Error('accord attendu');
    await repo.consommerAccord(premier.option_id, NOW);
    await repo.terminerPoseOption(premier.option_id, { ok: false, raison: 'simulateur_delai' });
    expect(await donnerAccord(repo, demande())).toMatchObject({ ok: true });
  });
});
