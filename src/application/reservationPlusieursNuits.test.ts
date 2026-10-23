import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { Proposition } from '../../types/dashboard';
import { prixAccordCents } from '../domain/accord';
import type { LigneDemandee, Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { annulerReservation } from './annulerReservation';
import { confirmerReservation } from './confirmerReservation';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';

// Un hôtel de 3 nuits sur une seule ligne : le simulateur ne pose et ne confirme qu'une date à la fois.
const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001', nom: 'Conseiller de test' };
const NOW = new Date('2026-10-21T15:00:00.000Z');
const NUIT_CENTS = 9600 * 2; // 96 € × 2 personnes
const HOTEL = {
  ...PROPOSITION_DEPOT_RECU.lignes[1]!,
  statut: 'confirme' as const, nb_nuits: 3, total_ligne_cents: NUIT_CENTS * 3,
  prix_confirme: { montant_cents: 9600, source: 'agent' as const, le: '2026-10-21T14:45:00Z', par: CONSEILLER.id },
  derniere_verification: { statut: 'ok' as const, prix_unitaire_cents: 9600, places_restantes: 4, le: '2026-10-21T14:45:00Z' },
};
const PROPOSITION: Proposition = { ...PROPOSITION_DEPOT_RECU, lignes: [PROPOSITION_DEPOT_RECU.lignes[0]!, HOTEL, PROPOSITION_DEPOT_RECU.lignes[2]!] };
const NUITS = ['2026-11-07', '2026-11-08', '2026-11-09'];

/** Simulateur d'une date à la fois ; `echoue` fait échouer l'appel pour cette date. */
function simulateur(echoue: { pose?: string; confirmation?: string } = {}) {
  const optionDe = (l: LigneDemandee) => ({
    option_id: `opt_${l.date}`, prestation_id: l.prestation_id, date: l.date, participants: l.participants,
    prix_total_cents: NUIT_CENTS, statut: 'active' as const, expire_le: l.date === '2026-11-08' ? '2026-10-23T12:00:00.000Z' : '2026-10-23T15:00:00.000Z',
  });
  const reservation = (option_id: string, statut: 'confirmee' | 'annulee') => ({
    reservation_id: option_id.replace('opt_', 'res_'), option_id, prestation_id: HOTEL.prestation.id, date: option_id.slice(4),
    participants: 2, prix_total_cents: NUIT_CENTS, statut, approuve_par: CONSEILLER.nom, confirmee_le: NOW.toISOString(),
  });
  return {
    poserOption: vi.fn(async (l: LigneDemandee) =>
      l.date === echoue.pose ? { ok: false as const, panne: 'refus' as const, code: 'complet', message: 'Plus de place', http: 409 } : { ok: true as const, valeur: optionDe(l) }),
    confirmerReservation: vi.fn(async (a: { option_id: string }) =>
      a.option_id === `opt_${echoue.confirmation}` ? { ok: false as const, panne: 'erreur_serveur' as const } : { ok: true as const, valeur: reservation(a.option_id, 'confirmee') }),
    annulerReservation: vi.fn(async (a: { reservation_id: string }) => ({ ok: true as const, valeur: reservation(a.reservation_id.replace('res_', 'opt_'), 'annulee') })),
    disponibilite: vi.fn(),
    catalogue: vi.fn(),
  } satisfies Prestataires;
}

async function accordSurHotel() {
  const repo = new AccordsEnMemoire();
  const r = await donnerAccord(repo, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION, ligneId: HOTEL.id, prixAfficheCents: NUIT_CENTS * 3, maintenant: NOW });
  if (!r.ok) throw new Error(`accord impossible : ${r.raison}`);
  return repo;
}

describe('réservation d’un hôtel de plusieurs nuits', () => {
  it('le prix accordé couvre toutes les nuits', () => {
    expect(prixAccordCents(HOTEL)).toBe(57600);
  });

  it('pose une option par nuit ; la démarche expire avec la première option qui expire', async () => {
    const repo = await accordSurHotel();
    const s = simulateur();
    const r = await poserOption(repo, s, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION, ligneId: HOTEL.id, maintenant: NOW });
    expect(r).toMatchObject({ ok: true, option_id: 'opt_2026-11-07', prix_total_cents: 57600, expire_le: '2026-10-23T12:00:00.000Z' });
    expect(s.poserOption.mock.calls.map(([l]) => l.date)).toEqual(NUITS);
    expect(repo.accords[0]).toMatchObject({
      statut: 'posee', option_id_simulateur: 'opt_2026-11-07',
      nuits: NUITS.map((date) => ({ date, option_id: `opt_${date}`, prix_total_cents: NUIT_CENTS })),
    });
  });

  it('une nuit complète arrête la pose : échec, réponses des nuits déjà posées gardées', async () => {
    const repo = await accordSurHotel();
    const s = simulateur({ pose: '2026-11-08' });
    const r = await poserOption(repo, s, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION, ligneId: HOTEL.id, maintenant: NOW });
    expect(r).toMatchObject({ ok: false, raison: 'simulateur_refus', detail: 'Plus de place (nuit du 2026-11-08)' });
    expect(s.poserOption).toHaveBeenCalledTimes(2); // la 3e nuit n'est pas demandée
    expect(repo.accords[0]!.statut).toBe('echec');
    expect(repo.accords[0]!.reponse_serveur).toEqual([expect.objectContaining({ option_id: 'opt_2026-11-07' }), expect.objectContaining({ panne: 'refus' })]);
  });

  it('confirme chaque nuit, puis annule chaque nuit', async () => {
    const repo = await accordSurHotel();
    const s = simulateur();
    await poserOption(repo, s, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION, ligneId: HOTEL.id, maintenant: NOW });

    const c = await confirmerReservation(repo, s, { conseiller: CONSEILLER, ligneId: HOTEL.id, cleApprobation: 'cle', maintenant: NOW });
    expect(c).toMatchObject({ ok: true, reservation_id: 'res_2026-11-07' });
    expect(s.confirmerReservation.mock.calls.map(([a]) => a.option_id)).toEqual(NUITS.map((d) => `opt_${d}`));
    expect(repo.accords[0]).toMatchObject({ statut: 'confirmee', nuits: NUITS.map((d) => expect.objectContaining({ reservation_id: `res_${d}` })) });

    const a = await annulerReservation(repo, s, { conseiller: CONSEILLER, ligneId: HOTEL.id, cleApprobation: 'cle', confirme: true, maintenant: NOW });
    expect(a).toMatchObject({ ok: true, reservation_id: 'res_2026-11-07' });
    expect(s.annulerReservation.mock.calls.map(([x]) => x.reservation_id)).toEqual(NUITS.map((d) => `res_${d}`));
    expect(repo.accords[0]!.statut).toBe('annulee');
  });

  it('une nuit qui échoue à la confirmation : les nuits déjà confirmées sont annulées, l’option reste posée', async () => {
    const repo = await accordSurHotel();
    const s = simulateur({ confirmation: '2026-11-09' });
    await poserOption(repo, s, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION, ligneId: HOTEL.id, maintenant: NOW });

    const c = await confirmerReservation(repo, s, { conseiller: CONSEILLER, ligneId: HOTEL.id, cleApprobation: 'cle', maintenant: NOW });
    expect(c).toMatchObject({ ok: false, raison: 'simulateur_erreur' });
    expect(s.annulerReservation.mock.calls.map(([x]) => x.reservation_id)).toEqual(['res_2026-11-07', 'res_2026-11-08']);
    expect(repo.accords[0]).toMatchObject({ statut: 'posee', erreur_option: 'simulateur_erreur' });
  });
});
