import { describe, expect, it, vi } from 'vitest';
import { PROPOSITION_DEPOT_RECU } from '../../fixtures/dashboard';
import type { Prestataires } from '../ports/prestataires';
import { AccordsEnMemoire } from '../infrastructure/db/accordsEnMemoire';
import { donnerAccord } from './donnerAccord';
import { poserOption } from './poserOption';

const CONSEILLER = { id: 'c0000000-0000-4000-8000-000000000001' };
const LIGNE = PROPOSITION_DEPOT_RECU.lignes[0];
const NOW = new Date('2026-10-21T15:00:00.000Z');
const optionServeur = {
  option_id: 'opt_serveur_123', prestation_id: LIGNE.prestation.id, date: LIGNE.date, participants: LIGNE.participants,
  prix_total_cents: (LIGNE.derniere_verification?.prix_unitaire_cents ?? 0) * LIGNE.participants,
  statut: 'active' as const, expire_le: '2026-10-23T15:00:00.000Z',
};
const fournisseur = (poserOption: Prestataires['poserOption']) => ({ poserOption } as Pick<Prestataires, 'poserOption'> as Prestataires);

async function depotAvecAccord() {
  const repo = new AccordsEnMemoire();
  const prix = (LIGNE.derniere_verification?.prix_unitaire_cents ?? 0) * LIGNE.participants;
  const r = await donnerAccord(repo, { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, prixAfficheCents: prix, maintenant: NOW });
  if (!r.ok) throw new Error('La fixture doit permettre un accord');
  return repo;
}

describe('poserOption (E9.4)', () => {
  it('refuse sans accord et trace la tentative sans appeler le simulateur', async () => {
    const repo = new AccordsEnMemoire();
    const poser = vi.fn();
    const r = await poserOption(repo, fournisseur(poser), { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW });
    expect(r).toEqual({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(poser).not.toHaveBeenCalled();
    expect(repo.historique.at(-1)).toMatchObject({ type: 'option', detail: { type: 'tentative_refusee', raison: 'accord_absent_ou_expire' } });
  });

  it('pose une option avec la réponse réelle du simulateur et enregistre son expiration', async () => {
    const repo = await depotAvecAccord();
    const poser = vi.fn(async () => ({ ok: true as const, valeur: optionServeur }));
    const r = await poserOption(repo, fournisseur(poser), { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW });
    expect(r).toMatchObject({ ok: true, option_id: 'opt_serveur_123', expire_le: optionServeur.expire_le, prix_total_cents: optionServeur.prix_total_cents });
    expect(poser).toHaveBeenCalledWith({ prestation_id: LIGNE.prestation.id, date: LIGNE.date, participants: LIGNE.participants });
    expect(repo.accords[0]).toMatchObject({ statut: 'posee', accord_utilise: true, option_id_simulateur: 'opt_serveur_123', expire_option_le: optionServeur.expire_le });
    expect(repo.historique.at(-1)).toMatchObject({ type: 'option', detail: { type: 'option', option_id: repo.accords[0].option_id, ok: true } });
  });

  it('consomme l’accord avant l’appel réseau et ne permet pas de rejouer après un délai', async () => {
    const repo = await depotAvecAccord();
    const poser = vi.fn(async () => ({ ok: false as const, panne: 'delai' as const }));
    const demande = { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW };
    expect(await poserOption(repo, fournisseur(poser), demande)).toMatchObject({ ok: false, raison: 'simulateur_delai' });
    expect(repo.accords[0]).toMatchObject({ statut: 'echec', accord_utilise: true });
    expect(await poserOption(repo, fournisseur(poser), demande)).toMatchObject({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(poser).toHaveBeenCalledTimes(1);
  });

  it('refuse une réponse serveur dont le prix ne correspond pas à l’accord', async () => {
    const repo = await depotAvecAccord();
    const poser = vi.fn(async () => ({ ok: true as const, valeur: { ...optionServeur, prix_total_cents: optionServeur.prix_total_cents + 100 } }));
    const r = await poserOption(repo, fournisseur(poser), { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: NOW });
    expect(r).toMatchObject({ ok: false, raison: 'reponse_serveur_incoherente' });
    expect(repo.accords[0].statut).toBe('echec');
    expect(repo.accords[0].reponse_serveur).toMatchObject({ prix_total_cents: optionServeur.prix_total_cents + 100 });
  });

  it('refuse un accord expiré', async () => {
    const repo = await depotAvecAccord();
    const poser = vi.fn();
    const plusTard = new Date(NOW.getTime() + 11 * 60_000);
    const r = await poserOption(repo, fournisseur(poser), { conseiller: CONSEILLER, proposition: PROPOSITION_DEPOT_RECU, ligneId: LIGNE.id, maintenant: plusTard });
    expect(r).toMatchObject({ ok: false, raison: 'accord_absent_ou_expire' });
    expect(poser).not.toHaveBeenCalled();
  });
});
