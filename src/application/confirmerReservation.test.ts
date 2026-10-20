import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';
import { confirmerReservation } from './confirmerReservation';

const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001', nom: 'Conseiller de test' };
const LIGNE = PROPOSITION_DEPOT_RECU.lignes[0];
const NOW = new Date('2026-10-21T15:00:00.000Z');
const prixTotal = (LIGNE.derniere_verification?.prix_unitaire_cents ?? 0) * LIGNE.participants;
const option = { option_id: 'opt_serveur_123', prestation_id: LIGNE.prestation.id, date: LIGNE.date, participants: LIGNE.participants, prix_total_cents: prixTotal, statut: 'active' as const, expire_le: '2026-10-21T16:00:00.000Z' };
const prestataires = (overrides: Partial<Prestataires> = {}) => ({
  poserOption: vi.fn(async () => ({ ok: true as const, valeur: option })),
  confirmerReservation: vi.fn(async () => ({ ok: true as const, valeur: { reservation_id: 'res_123', option_id: option.option_id, prestation_id: option.prestation_id, date: option.date, participants: option.participants, prix_total_cents: option.prix_total_cents, statut: 'confirmee' as const, approuve_par: CONSEILLER.nom, confirmee_le: NOW.toISOString() } })),
  disponibilite: vi.fn(async () => ({ ok: true as const, valeur: { prestation_id: option.prestation_id, date: option.date, participants: option.participants, disponible: true, places_restantes: 4, prix_unitaire_cents: 5000, prix_total_cents: 10000 } })),
  ...overrides,
} as unknown as Prestataires);

async function optionActive() {
  const repo = new AccordsEnMemoire();
  const prix = prixTotal;
  const accord = await donnerAccord(repo, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, prixAfficheCents: prix, maintenant: NOW });
  if (!accord.ok) throw new Error('Accord de test impossible');
  const p = prestataires();
  const pose = await poserOption(repo, p, { conseiller: { id: CONSEILLER.id }, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW });
  if (!pose.ok) throw new Error('Pose de test impossible');
  return { repo, p };
}

describe('confirmerReservation (E9.5)', () => {
  it('refuse sans clé et ne contacte pas le simulateur', async () => {
    const { repo, p } = await optionActive();
    const r = await confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: ' ', maintenant: NOW });
    expect(r).toMatchObject({ ok: false, raison: 'cle_absente' });
    expect(p.confirmerReservation).not.toHaveBeenCalled();
  });

  it('exige une action de confirmation distincte et n’enregistre jamais la clé', async () => {
    const { repo, p } = await optionActive();
    const secret = 'CLE-APPROBATION-ULTRA-SECRETE';
    const r = await confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: secret, maintenant: NOW });
    expect(r).toMatchObject({ ok: true, reservation_id: 'res_123' });
    expect(p.confirmerReservation).toHaveBeenCalledWith({ option_id: option.option_id, cle_approbation: secret, approuve_par: CONSEILLER.nom });
    expect(JSON.stringify({ accords: repo.accords, historique: repo.historique })).not.toContain(secret);
    expect(repo.accords[0]).toMatchObject({ statut: 'confirmee', reservation_id_simulateur: 'res_123' });
  });

  it('si l’option a expiré, revérifie le prix et ne confirme jamais', async () => {
    const { repo, p } = await optionActive();
    const r = await confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: 'cle-valide', maintenant: new Date('2026-10-21T17:00:00.000Z') });
    expect(r).toMatchObject({ ok: false, raison: 'option_expiree', prix_unitaire_reverifie_cents: 5000 });
    expect(p.disponibilite).toHaveBeenCalledOnce();
    expect(p.confirmerReservation).not.toHaveBeenCalled();
  });

  it('trace un refus du simulateur sans conserver la clé', async () => {
    const { repo } = await optionActive();
    const p = prestataires({ confirmerReservation: vi.fn(async () => ({ ok: false as const, panne: 'refus' as const, code: 'human_approval_required', message: 'refus', http: 403 })) });
    const secret = 'NE-PAS-JOURNALISER';
    const r = await confirmerReservation(repo, p, { conseiller: CONSEILLER, ligneId: LIGNE.id, cleApprobation: secret, maintenant: NOW });
    expect(r).toMatchObject({ ok: false, raison: 'simulateur_refus' });
    expect(JSON.stringify(repo.historique)).not.toContain(secret);
    expect(repo.historique.at(-1)).toMatchObject({ detail: { type: 'tentative_confirmation', raison: 'simulateur_refus' } });
  });
});
