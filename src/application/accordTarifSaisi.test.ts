import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { LigneProposition, Proposition } from '../../types/dashboard';
import { basePrixAccord, evaluerAccord, prixAccordCents } from '../domain/accord';
import type { LigneDemandee, Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';

// L'agent n'a pas pu vérifier le train (échec à 14 h 38) ; le conseiller a appelé le prestataire et saisi 50 € à 15 h.
const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001' };
const NOW = new Date('2026-10-21T15:30:00.000Z');
const ECHEC = { statut: 'echec' as const, prix_unitaire_cents: null, places_restantes: null, le: '2026-10-21T14:38:00Z' };
const SAISI = { montant_cents: 5000, source: 'telephone' as const, le: '2026-10-21T15:00:00Z', par: CONSEILLER.id };
const TRAIN: LigneProposition = { ...PROPOSITION_DEPOT_RECU.lignes[0]!, prix_confirme: SAISI, derniere_verification: ECHEC, total_ligne_cents: 10000 };
const avec = (ligne: LigneProposition): Proposition => ({ ...PROPOSITION_DEPOT_RECU, lignes: [ligne, ...PROPOSITION_DEPOT_RECU.lignes.slice(1)] });
const evaluer = (ligne: LigneProposition, extra: { refusPrixLe?: string } = {}) =>
  evaluerAccord({ statutProposition: 'depot_recu', ligne, prixAfficheCents: prixAccordCents(ligne) ?? 0, demarcheEnCours: false, maintenant: NOW, ...extra });

/** Simulateur qui pose au prix donné (par personne). */
const simulateur = (prixParPersonne: number) => ({
  poserOption: vi.fn(async (l: LigneDemandee) => ({
    ok: true as const,
    valeur: {
      option_id: `opt_${l.date}`, prestation_id: l.prestation_id, date: l.date, participants: l.participants,
      prix_total_cents: prixParPersonne * l.participants, statut: 'active' as const, expire_le: '2026-10-23T15:00:00.000Z',
    },
  })),
} as unknown as Prestataires);

describe('prix de référence de l’accord : vérification de l’agent ou tarif saisi', () => {
  it('l’agent a vérifié (ok) et le prix accepté vient de lui : prix de l’agent', () => {
    const l = { ...TRAIN, prix_confirme: { ...SAISI, source: 'agent' as const, montant_cents: 4800 }, derniere_verification: { statut: 'ok' as const, prix_unitaire_cents: 4800, places_restantes: 5, le: SAISI.le } };
    expect(basePrixAccord(l)).toEqual({ source: 'agent', prix_unitaire_cents: 4800, le: SAISI.le });
  });

  it('tarif saisi après un échec de l’agent : le tarif saisi', () => {
    expect(basePrixAccord(TRAIN)).toEqual({ source: 'telephone', prix_unitaire_cents: 5000, le: SAISI.le });
    expect(prixAccordCents(TRAIN)).toBe(10000);
  });

  it('tarif saisi après un constat « indisponible » : le tarif saisi (le conseiller a joint le prestataire depuis)', () => {
    const l = { ...TRAIN, derniere_verification: { ...ECHEC, statut: 'indisponible' as const, prix_unitaire_cents: 4800, places_restantes: 0 } };
    expect(basePrixAccord(l)?.source).toBe('telephone');
    expect(evaluer(l)).toMatchObject({ ok: true, source_prix: 'telephone' });
  });

  it('tarif saisi AVANT un constat « indisponible » : aucun prix fiable', () => {
    const l = { ...TRAIN, derniere_verification: { statut: 'indisponible' as const, prix_unitaire_cents: 4800, places_restantes: 0, le: '2026-10-21T15:10:00Z' } };
    expect(basePrixAccord(l)).toBeNull();
    expect(evaluer(l)).toEqual({ ok: false, raison: 'verification_non_ok' });
  });

  it('tarif saisi sans aucune vérification de l’agent : le tarif saisi', () => {
    expect(evaluer({ ...TRAIN, derniere_verification: null })).toMatchObject({ ok: true, prix_accorde_cents: 10000, source_prix: 'telephone' });
  });

  it('tarif saisi plus récent qu’une vérification « ok » : le tarif saisi l’emporte', () => {
    const l = { ...TRAIN, derniere_verification: { statut: 'ok' as const, prix_unitaire_cents: 4800, places_restantes: 5, le: ECHEC.le } };
    expect(basePrixAccord(l)?.prix_unitaire_cents).toBe(5000);
  });

  it('une vérification en échec après le tarif saisi ne compte pas : le tarif saisi vaut toujours', () => {
    const l = { ...TRAIN, derniere_verification: { ...ECHEC, le: '2026-10-21T15:10:00Z' } };
    expect(basePrixAccord(l)?.source).toBe('telephone');
    expect(evaluer(l)).toMatchObject({ ok: true, prix_accorde_cents: 10000 });
  });

  it('prix de l’agent accepté, puis revérification en échec : le prix accepté vaut toujours', () => {
    const l = { ...TRAIN, prix_confirme: { ...SAISI, source: 'agent' as const, montant_cents: 4800 }, derniere_verification: { ...ECHEC, le: '2026-10-21T15:10:00Z' } };
    expect(basePrixAccord(l)).toEqual({ source: 'agent', prix_unitaire_cents: 4800, le: SAISI.le });
  });

  it('nouvelle vérification « ok » plus récente que le tarif saisi : le prix de l’agent', () => {
    const l = { ...TRAIN, derniere_verification: { statut: 'ok' as const, prix_unitaire_cents: 5200, places_restantes: 3, le: '2026-10-21T15:10:00Z' } };
    expect(basePrixAccord(l)).toMatchObject({ source: 'agent', prix_unitaire_cents: 5200 });
  });

  it('ni vérification utile ni tarif confirmé : verification_absente', () => {
    const l = { ...TRAIN, prix_confirme: null, derniere_verification: null };
    expect(basePrixAccord(l)).toBeNull();
    expect(evaluer(l)).toEqual({ ok: false, raison: 'verification_absente' });
  });

  it('après un refus de pose pour un autre prix : il faut un tarif saisi ou une vérification postérieurs', () => {
    expect(evaluer(TRAIN, { refusPrixLe: '2026-10-21T15:10:00Z' })).toEqual({ ok: false, raison: 'prix_a_reverifier' });
    expect(evaluer(TRAIN, { refusPrixLe: '2026-10-21T14:50:00Z' })).toMatchObject({ ok: true });
  });
});

describe('accord puis pose de l’option sur un tarif saisi', () => {
  it('l’accord garde la source du prix ; le prestataire annonce le même prix : option posée', async () => {
    const repo = new AccordsEnMemoire();
    const accord = await donnerAccord(repo, { conseiller: CONSEILLER, proposition: avec(TRAIN), ligneId: TRAIN.id, prixAfficheCents: 10000, maintenant: NOW });
    expect(accord).toMatchObject({ ok: true, prix_accorde_cents: 10000 });
    expect(repo.accords[0]).toMatchObject({ source_prix: 'telephone', prix_accorde_cents: 10000 });

    const r = await poserOption(repo, simulateur(5000), { conseiller: CONSEILLER, proposition: avec(TRAIN), ligneId: TRAIN.id, maintenant: NOW });
    expect(r).toMatchObject({ ok: true, prix_total_cents: 10000 });
    expect(repo.accords[0]!.statut).toBe('posee');
  });

  it('le prestataire annonce un autre prix : option refusée, avec les deux prix', async () => {
    const repo = new AccordsEnMemoire();
    await donnerAccord(repo, { conseiller: CONSEILLER, proposition: avec(TRAIN), ligneId: TRAIN.id, prixAfficheCents: 10000, maintenant: NOW });
    const r = await poserOption(repo, simulateur(4800), { conseiller: CONSEILLER, proposition: avec(TRAIN), ligneId: TRAIN.id, maintenant: NOW });
    expect(r).toEqual({
      ok: false, raison: 'reponse_serveur_incoherente',
      detail: 'Le prestataire annonce 48,00 € par personne, tarif saisi : 50,00 €.',
    });
    expect(repo.accords[0]!.statut).toBe('echec');
  });

  it('hôtel de 3 nuits sur tarif saisi : une option par nuit, au tarif saisi', async () => {
    const hotel: LigneProposition = {
      ...PROPOSITION_DEPOT_RECU.lignes[1]!, statut: 'confirme', nb_nuits: 3, total_ligne_cents: 9000 * 2 * 3,
      prix_confirme: { ...SAISI, montant_cents: 9000, source: 'mail' }, derniere_verification: null,
    };
    const proposition = { ...PROPOSITION_DEPOT_RECU, lignes: [hotel] };
    const repo = new AccordsEnMemoire();
    expect(await donnerAccord(repo, { conseiller: CONSEILLER, proposition, ligneId: hotel.id, prixAfficheCents: 54000, maintenant: NOW })).toMatchObject({ ok: true });
    const s = simulateur(9000);
    expect(await poserOption(repo, s, { conseiller: CONSEILLER, proposition, ligneId: hotel.id, maintenant: NOW })).toMatchObject({ ok: true, prix_total_cents: 54000 });
    expect(s.poserOption).toHaveBeenCalledTimes(3);
  });
});
