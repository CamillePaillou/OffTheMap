/**
 * Tests généraux du parcours de réservation (E9) : accord → option → confirmation → annulation,
 * avec les vrais cas d'usage, le dépôt en mémoire et un simulateur simulé.
 * On vérifie le parcours entier et les garde-fous qui le traversent : rien n'est écrit chez le prestataire
 * sans l'accord puis la seconde validation du conseiller, et aucune clé ne reste dans les données ni le journal.
 */
import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { annulerReservation } from './annulerReservation';
import { confirmerReservation } from './confirmerReservation';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';

const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001', nom: 'Conseiller de test' };
const LIGNE = PROPOSITION_DEPOT_RECU.lignes.find((l) => l.statut === 'confirme')!;
const LIGNE_INDISPONIBLE = PROPOSITION_DEPOT_RECU.lignes.find((l) => l.statut === 'indisponible')!;
const NOW = new Date('2026-10-21T15:00:00.000Z');
const PRIX_TOTAL = (LIGNE.derniere_verification?.prix_unitaire_cents ?? 0) * LIGNE.participants;

const OPTION = {
  option_id: 'opt_serveur_1', prestation_id: LIGNE.prestation.id, date: LIGNE.date, participants: LIGNE.participants,
  prix_total_cents: PRIX_TOTAL, statut: 'active' as const, expire_le: '2026-10-21T16:00:00.000Z',
};
const RESERVATION = {
  reservation_id: 'res_1', option_id: OPTION.option_id, prestation_id: OPTION.prestation_id, date: OPTION.date,
  participants: OPTION.participants, prix_total_cents: PRIX_TOTAL, approuve_par: CONSEILLER.nom, confirmee_le: NOW.toISOString(),
};

/** Simulateur simulé : `appels` garde l'ordre des écritures reçues. */
function simulateur(surcharges: Partial<Prestataires> = {}) {
  const appels: string[] = [];
  const p = {
    disponibilite: vi.fn(async () => ({ ok: true as const, valeur: { prestation_id: OPTION.prestation_id, date: OPTION.date, participants: OPTION.participants, disponible: true, places_restantes: 4, prix_unitaire_cents: 5000, prix_total_cents: 10000 } })),
    poserOption: vi.fn(async () => { appels.push('poser'); return { ok: true as const, valeur: OPTION }; }),
    confirmerReservation: vi.fn(async () => { appels.push('confirmer'); return { ok: true as const, valeur: { ...RESERVATION, statut: 'confirmee' as const } }; }),
    annulerReservation: vi.fn(async () => { appels.push('annuler'); return { ok: true as const, valeur: { ...RESERVATION, statut: 'annulee' as const } }; }),
    ...surcharges,
  } as unknown as Prestataires;
  return { p, appels };
}

const accord = (repo: AccordsEnMemoire, o: Partial<Parameters<typeof donnerAccord>[1]> = {}) =>
  donnerAccord(repo, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, prixAfficheCents: PRIX_TOTAL, maintenant: NOW, ...o });
const pose = (repo: AccordsEnMemoire, p: Prestataires, maintenant = NOW) =>
  poserOption(repo, p, { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant });
const confirme = (repo: AccordsEnMemoire, p: Prestataires, cle = 'cle-confirmation', maintenant = NOW) =>
  confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: cle, maintenant });
const annule = (repo: AccordsEnMemoire, p: Prestataires, o: Partial<Parameters<typeof annulerReservation>[2]> = {}) =>
  annulerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: 'cle-annulation', confirme: true, maintenant: NOW, ...o });

describe('parcours de réservation (E9)', () => {
  it('déroule accord, option, confirmation puis annulation, dans l’ordre, avec un statut et un journal à chaque étape', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();

    expect(await accord(repo)).toMatchObject({ ok: true, prix_accorde_cents: PRIX_TOTAL });
    expect(repo.accords[0].statut).toBe('accord_donne');
    expect(appels).toEqual([]); // l'accord seul n'écrit rien chez le prestataire

    expect(await pose(repo, p)).toMatchObject({ ok: true, option_id: 'opt_serveur_1' });
    expect(repo.accords[0]).toMatchObject({ statut: 'posee', accord_utilise: true });

    expect(await confirme(repo, p)).toMatchObject({ ok: true, reservation_id: 'res_1' });
    expect(repo.accords[0]).toMatchObject({ statut: 'confirmee', reservation_id_simulateur: 'res_1' });

    expect(await annule(repo, p)).toMatchObject({ ok: true, reservation_id: 'res_1' });
    expect(repo.accords[0].statut).toBe('annulee');

    expect(appels).toEqual(['poser', 'confirmer', 'annuler']);
    const types = repo.historique.map((e) => e.detail.type);
    expect(types).toEqual(['accord', 'option', 'confirmation', 'annulation']);
    expect(repo.historique.at(-1)).toMatchObject({ auteur_id: CONSEILLER.id, detail: { ligne_id: LIGNE.id } });
  });

  it('sans accord, aucune option n’est posée et la tentative est tracée', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    expect(await pose(repo, p)).toMatchObject({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(appels).toEqual([]);
    expect(repo.historique.at(-1)).toMatchObject({ detail: { type: 'tentative_refusee' } });
  });

  it('un accord est à usage unique : une seconde pose est refusée', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    await accord(repo);
    expect((await pose(repo, p)).ok).toBe(true);
    expect(await pose(repo, p)).toMatchObject({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(appels).toEqual(['poser']);
  });

  it('un accord expiré ne permet pas de poser une option', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    await accord(repo);
    const trop_tard = new Date(NOW.getTime() + 11 * 60_000);
    expect(await pose(repo, p, trop_tard)).toMatchObject({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(appels).toEqual([]);
  });

  it('refuse l’accord si le prix a changé ou si la ligne est indisponible, sans rien écrire', async () => {
    const repo = new AccordsEnMemoire();
    expect(await accord(repo, { prixAfficheCents: PRIX_TOTAL - 100 })).toEqual({ ok: false, raison: 'prix_modifie' });
    expect(await accord(repo, { ligneId: LIGNE_INDISPONIBLE.id, prixAfficheCents: 0 })).toMatchObject({ ok: false });
    expect(repo.accords).toHaveLength(0);
    expect(repo.historique).toHaveLength(0);
  });

  it('sans clé d’approbation, aucune confirmation : l’option reste posée', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    await accord(repo);
    await pose(repo, p);
    expect(await confirme(repo, p, '   ')).toMatchObject({ ok: false, raison: 'cle_absente' });
    expect(repo.accords[0].statut).toBe('posee');
    expect(appels).toEqual(['poser']);
  });

  it('une option expirée n’est jamais confirmée : le prix est revérifié', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    await accord(repo);
    await pose(repo, p);
    const apres = new Date('2026-10-21T17:00:00.000Z');
    expect(await confirme(repo, p, 'cle', apres)).toMatchObject({ ok: false, raison: 'option_expiree', prix_unitaire_reverifie_cents: 5000 });
    expect(p.disponibilite).toHaveBeenCalledOnce();
    expect(appels).toEqual(['poser']);
  });

  it('annuler exige la clé et la confirmation, et seulement sur une réservation confirmée', async () => {
    const repo = new AccordsEnMemoire();
    const { p, appels } = simulateur();
    expect(await annule(repo, p)).toMatchObject({ ok: false, raison: 'reservation_introuvable' });
    await accord(repo);
    await pose(repo, p);
    expect(await annule(repo, p)).toMatchObject({ ok: false, raison: 'reservation_introuvable' }); // option posée, pas confirmée
    await confirme(repo, p);
    expect(await annule(repo, p, { cleApprobation: '' })).toMatchObject({ ok: false, raison: 'cle_absente' });
    expect(await annule(repo, p, { confirme: false })).toMatchObject({ ok: false, raison: 'confirmation_absente' });
    expect(repo.accords[0].statut).toBe('confirmee');
    expect(appels).toEqual(['poser', 'confirmer']);
  });

  it('une panne du simulateur à la pose ou à la confirmation ne fait rien croire de faux', async () => {
    const repo = new AccordsEnMemoire();
    const { p } = simulateur({ poserOption: vi.fn(async () => ({ ok: false as const, panne: 'erreur_serveur' as const })) } as Partial<Prestataires>);
    await accord(repo);
    expect(await pose(repo, p)).toMatchObject({ ok: false, raison: 'simulateur_erreur' });
    expect(repo.accords[0].statut).toBe('echec');
    expect(await confirme(repo, simulateur().p)).toMatchObject({ ok: false, raison: 'option_introuvable' });
  });

  it('aucune clé d’approbation ne reste dans les accords ni dans le journal, à aucune étape', async () => {
    const repo = new AccordsEnMemoire();
    const { p } = simulateur();
    const cleConfirmation = 'SECRET-CONFIRMATION-9f3a';
    const cleAnnulation = 'SECRET-ANNULATION-77b1';
    await accord(repo);
    await pose(repo, p);
    await confirme(repo, p, cleConfirmation);
    await annule(repo, p, { cleApprobation: cleAnnulation });
    const tout = JSON.stringify({ accords: repo.accords, historique: repo.historique });
    expect(tout).not.toContain(cleConfirmation);
    expect(tout).not.toContain(cleAnnulation);
  });
});
