import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';
import { confirmerReservation } from './confirmerReservation';
import { annulerReservation } from './annulerReservation';

const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001', nom: 'Conseiller de test' };
const LIGNE = PROPOSITION_DEPOT_RECU.lignes[0];
const NOW = new Date('2026-10-21T15:00:00.000Z');
const prixTotal = (LIGNE.derniere_verification?.prix_unitaire_cents ?? 0) * LIGNE.participants;
const option = { option_id: 'opt_serveur_123', prestation_id: LIGNE.prestation.id, date: LIGNE.date, participants: LIGNE.participants, prix_total_cents: prixTotal, statut: 'active' as const, expire_le: '2026-10-21T16:00:00.000Z' };
const reservation = { reservation_id: 'res_123', option_id: option.option_id, prestation_id: option.prestation_id, date: option.date, participants: option.participants, prix_total_cents: option.prix_total_cents, approuve_par: CONSEILLER.nom, confirmee_le: NOW.toISOString() };
const annulee = { ...reservation, statut: 'annulee' as const };

const prestataires = (overrides: Partial<Prestataires> = {}) => ({
  poserOption: vi.fn(async () => ({ ok: true as const, valeur: option })),
  confirmerReservation: vi.fn(async () => ({ ok: true as const, valeur: { ...reservation, statut: 'confirmee' as const } })),
  annulerReservation: vi.fn(async () => ({ ok: true as const, valeur: annulee })),
  ...overrides,
} as unknown as Prestataires);

/** Parcours complet jusqu'à une réservation confirmée, avec les vrais cas d'usage. */
async function reservationConfirmee() {
  const repo = new AccordsEnMemoire();
  const accord = await donnerAccord(repo, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, prixAfficheCents: prixTotal, maintenant: NOW });
  if (!accord.ok) throw new Error('Accord de test impossible');
  const p = prestataires();
  const pose = await poserOption(repo, p, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW });
  if (!pose.ok) throw new Error('Pose de test impossible');
  const conf = await confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: 'cle-de-confirmation', maintenant: NOW });
  if (!conf.ok) throw new Error('Confirmation de test impossible');
  return { repo, p };
}

const demande = (o: Partial<Parameters<typeof annulerReservation>[2]> = {}) => ({
  conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: 'cle-annulation', confirme: true, maintenant: NOW, ...o,
});

describe('annulerReservation (E9.8)', () => {
  it('annule avec la clé et la confirmation, affiche la réponse du simulateur et journalise au nom du conseiller', async () => {
    const { repo, p } = await reservationConfirmee();
    const r = await annulerReservation(repo, p, demande());
    expect(r).toMatchObject({ ok: true, reservation_id: 'res_123', reponse_serveur: { statut: 'annulee' } });
    expect(p.annulerReservation).toHaveBeenCalledWith({ reservation_id: 'res_123', cle_approbation: 'cle-annulation', approuve_par: CONSEILLER.nom });
    expect(repo.accords[0]).toMatchObject({ statut: 'annulee', reponse_annulation: { statut: 'annulee' } });
    expect(repo.historique.at(-1)).toMatchObject({ type: 'option', auteur_id: CONSEILLER.id, detail: { type: 'annulation', ok: true, ligne_id: LIGNE.id } });
  });

  it('refuse sans clé d’approbation, sans appeler le simulateur, et trace la tentative', async () => {
    const { repo, p } = await reservationConfirmee();
    const r = await annulerReservation(repo, p, demande({ cleApprobation: '  ' }));
    expect(r).toMatchObject({ ok: false, raison: 'cle_absente' });
    expect(p.annulerReservation).not.toHaveBeenCalled();
    expect(repo.accords[0].statut).toBe('confirmee');
    expect(repo.historique.at(-1)).toMatchObject({ detail: { type: 'tentative_annulation', raison: 'cle_absente' } });
  });

  it('refuse sans confirmation explicite, même avec la bonne clé', async () => {
    const { repo, p } = await reservationConfirmee();
    const r = await annulerReservation(repo, p, demande({ confirme: false }));
    expect(r).toMatchObject({ ok: false, raison: 'confirmation_absente' });
    expect(p.annulerReservation).not.toHaveBeenCalled();
    expect(repo.accords[0].statut).toBe('confirmee');
  });

  it('refuse un conseiller non identifié', async () => {
    const { repo, p } = await reservationConfirmee();
    expect(await annulerReservation(repo, p, demande({ conseiller: { id: ' ', nom: '' } }))).toMatchObject({ ok: false, raison: 'conseiller_non_identifie' });
    expect(p.annulerReservation).not.toHaveBeenCalled();
  });

  it('refuse quand aucune réservation n’est confirmée (option seulement posée, ou déjà annulée)', async () => {
    const repo = new AccordsEnMemoire();
    const p = prestataires();
    expect(await annulerReservation(repo, p, demande())).toMatchObject({ ok: false, raison: 'reservation_introuvable' });

    const { repo: repo2, p: p2 } = await reservationConfirmee();
    expect((await annulerReservation(repo2, p2, demande())).ok).toBe(true);
    expect(await annulerReservation(repo2, p2, demande())).toMatchObject({ ok: false, raison: 'reservation_introuvable' });
    expect(p2.annulerReservation).toHaveBeenCalledTimes(1);
  });

  it('trace un refus du simulateur, garde la réservation confirmée et ne conserve jamais la clé', async () => {
    const { repo } = await reservationConfirmee();
    const p = prestataires({ annulerReservation: vi.fn(async () => ({ ok: false as const, panne: 'refus' as const, code: 'human_approval_required', message: 'clé refusée', http: 403 })) });
    const secret = 'NE-PAS-JOURNALISER-ANNULATION';
    const r = await annulerReservation(repo, p, demande({ cleApprobation: secret }));
    expect(r).toMatchObject({ ok: false, raison: 'simulateur_refus' });
    expect(repo.accords[0].statut).toBe('confirmee');
    expect(JSON.stringify({ accords: repo.accords, historique: repo.historique })).not.toContain(secret);
  });

  it('en cas de délai, la réservation reste confirmée chez nous et la tentative est tracée', async () => {
    const { repo } = await reservationConfirmee();
    const p = prestataires({ annulerReservation: vi.fn(async () => ({ ok: false as const, panne: 'delai' as const })) });
    expect(await annulerReservation(repo, p, demande())).toMatchObject({ ok: false, raison: 'simulateur_delai' });
    expect(repo.accords[0].statut).toBe('confirmee');
    expect(repo.historique.at(-1)).toMatchObject({ auteur_id: CONSEILLER.id, detail: { type: 'annulation', ok: false, raison: 'simulateur_delai' } });
  });

  it('refuse une réponse du simulateur qui n’annule pas la bonne réservation', async () => {
    const { repo } = await reservationConfirmee();
    const autre = prestataires({ annulerReservation: vi.fn(async () => ({ ok: true as const, valeur: { ...annulee, reservation_id: 'res_autre' } })) });
    expect(await annulerReservation(repo, autre, demande())).toMatchObject({ ok: false, raison: 'reponse_serveur_incoherente' });
    expect(repo.accords[0].statut).toBe('confirmee');

    const pasAnnulee = prestataires({ annulerReservation: vi.fn(async () => ({ ok: true as const, valeur: { ...reservation, statut: 'confirmee' as const } })) });
    expect(await annulerReservation(repo, pasAnnulee, demande())).toMatchObject({ ok: false, raison: 'reponse_serveur_incoherente' });
    expect(repo.accords[0].statut).toBe('confirmee');
  });
});
