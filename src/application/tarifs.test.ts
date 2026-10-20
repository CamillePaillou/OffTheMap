import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALERTES_BLOQUANTES } from '../../types';
import { TarifsEnMemoire, type LigneEnMemoire, type PropositionEnMemoire } from '../infrastructure/db/tarifsEnMemoire';
import { accepterVerification, confirmerTarif, envoyerProposition, marquerIndisponible, revoirLigne, schemaTarif } from './tarifs';

const P = 'p1';
const ALICE = 'alice';

// Cas A de docs/specs/chiffrage.md : 2 adultes à Nantes, 1 nuit, budget 400 € ; train 48 €, hôtel 96 €, atelier 35 €.
function ligne(id: string, prestation_id: string, type: LigneEnMemoire['type'], date: string, prix: number): LigneEnMemoire {
  return {
    id, prestation_id, type, capacite: 8, actif: true, date, participants: 2, prix_unitaire_catalogue_cents: prix,
    prix_confirme_cents: null, statut: 'a_verifier', source: null, confirme_par: null, verification: null,
  };
}

let repo: TarifsEnMemoire;
let p: PropositionEnMemoire;
beforeEach(() => {
  repo = new TarifsEnMemoire();
  p = {
    id: P, statut: 'a_verifier', voyageurs: 2, date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1,
    budget_reference_cents: 40000, total_cents: 35800, alertes: [], envoyee_par: null,
    lignes: [
      ligne('train', 'train-nantes-01', 'transport', '2026-11-07', 4800),
      ligne('hotel', 'hotel-nantes-01', 'hebergement', '2026-11-07', 9600),
      ligne('atelier', 'activite-nantes-01', 'activite', '2026-11-07', 3500),
    ],
  };
  repo.propositions.set(P, p);
});

const confirmerTout = async () => {
  for (const l of p.lignes) await confirmerTarif(repo, { ligneId: l.id, conseillerId: ALICE, montant: String(l.prix_unitaire_catalogue_cents / 100), source: 'telephone' });
};

describe('saisie d’un tarif', () => {
  it.each([['35', 3500], ['35,5', 3550], ['35.50', 3550], ['0', 0], [' 120,05 ', 12005]])('« %s » € → %i centimes, sans flottant', (saisi, cents) => {
    expect(schemaTarif.parse({ montant: saisi, source: 'mail' }).montant).toBe(cents);
  });
  it.each(['', '-3', '35,555', '3e2', 'trente'])('refuse « %s »', (saisi) => {
    expect(schemaTarif.safeParse({ montant: saisi, source: 'mail' }).success).toBe(false);
  });
  it('refuse « agent » comme source saisie : c’est réservé au prix revérifié accepté', () => {
    expect(schemaTarif.safeParse({ montant: '35', source: 'agent' }).success).toBe(false);
  });
});

describe('confirmer les tarifs (E5.1)', () => {
  it('enregistre le tarif avec sa source et son auteur, et recalcule le total', async () => {
    const r = await confirmerTarif(repo, { ligneId: 'atelier', conseillerId: ALICE, montant: '40', source: 'telephone' });
    expect(r).toEqual({ ok: true, statutProposition: 'a_verifier' });
    expect(p.lignes[2]).toMatchObject({ statut: 'confirme', prix_confirme_cents: 4000, source: 'telephone', confirme_par: ALICE });
    expect(p.total_cents).toBe(36800); // cas B : atelier à 40 €
    expect(p.alertes.map((a) => a.code)).toEqual(['budget_proche']); // 92 % du budget
  });

  it('passe la proposition en prete quand la dernière ligne est confirmée', async () => {
    await confirmerTout();
    expect(p.statut).toBe('prete');
    expect(repo.journal).toEqual(['a_verifier>prete']);
  });

  it('accepte le prix revérifié par l’agent, source « agent »', async () => {
    p.lignes[0]!.verification = { statut: 'ok', prix_unitaire_cents: 5200 };
    expect((await accepterVerification(repo, { ligneId: 'train', conseillerId: ALICE })).ok).toBe(true);
    expect(p.lignes[0]).toMatchObject({ statut: 'confirme', prix_confirme_cents: 5200, source: 'agent' });
  });

  it('accepte une indisponibilité constatée par l’agent, mais aucun prix d’une vérification en échec', async () => {
    p.lignes[1]!.verification = { statut: 'indisponible', prix_unitaire_cents: 9600 };
    await accepterVerification(repo, { ligneId: 'hotel', conseillerId: ALICE });
    expect(p.lignes[1]!.statut).toBe('indisponible');
    expect(p.total_cents).toBe(16600); // l'hôtel sort du total
    p.lignes[0]!.verification = { statut: 'echec', prix_unitaire_cents: null };
    expect(await accepterVerification(repo, { ligneId: 'train', conseillerId: ALICE })).toEqual({ ok: false, raison: 'pas_de_prix_verifie' });
    expect(await accepterVerification(repo, { ligneId: 'atelier', conseillerId: ALICE })).toEqual({ ok: false, raison: 'pas_de_prix_verifie' });
  });

  it('refuse une saisie invalide sans rien écrire', async () => {
    const r = await confirmerTarif(repo, { ligneId: 'atelier', conseillerId: ALICE, montant: 'abc', source: '' });
    expect(r).toMatchObject({ ok: false, erreurs: { montant: expect.any(String), source: expect.any(String) } });
    expect(p.lignes[2]!.statut).toBe('a_verifier');
  });

  it('repasse une ligne à vérifier : la proposition redevient à vérifier et le tarif confirmé est effacé', async () => {
    await confirmerTout();
    expect((await revoirLigne(repo, { ligneId: 'hotel', conseillerId: ALICE })).ok).toBe(true);
    expect(p.statut).toBe('a_verifier');
    expect(p.lignes[1]).toMatchObject({ statut: 'a_verifier', prix_confirme_cents: null, source: null });
  });

  it('refuse une transition hors matrice, et toute modification après l’envoi', async () => {
    expect(await revoirLigne(repo, { ligneId: 'train', conseillerId: ALICE })).toEqual({ ok: false, raison: 'transition_interdite' });
    await confirmerTout();
    await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE });
    expect(await marquerIndisponible(repo, { ligneId: 'train', conseillerId: ALICE })).toEqual({ ok: false, raison: 'proposition_figee' });
  });
});

describe('envoyer la proposition', () => {
  it('Scénario : envoi bloqué — une ligne « à vérifier », l’envoi est refusé et le statut ne change pas', async () => {
    await confirmerTarif(repo, { ligneId: 'train', conseillerId: ALICE, montant: '48', source: 'mail' });
    await confirmerTarif(repo, { ligneId: 'hotel', conseillerId: ALICE, montant: '96', source: 'mail' });
    const avant = p.statut;
    const r = await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE });
    expect(r).toEqual({ ok: false, raison: 'bloque', bloquants: ['1 ligne à vérifier'] });
    expect(p.statut).toBe(avant);
    expect(p.envoyee_par).toBeNull();
  });

  it('refuse l’envoi même si la base croit la proposition prête alors qu’une ligne est à vérifier', async () => {
    p.statut = 'prete'; // état incohérent : la ligne fait foi
    expect(await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE })).toMatchObject({ ok: false, raison: 'bloque' });
    expect(p.statut).toBe('prete');
  });

  it('refuse l’envoi avec une alerte bloquante, même si tous les prix sont confirmés', async () => {
    p.lignes[1]!.date = '2026-11-08'; // nuit du départ : date_hors_sejour (cas E)
    await confirmerTout();
    const r = await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE });
    expect(r).toMatchObject({ ok: false, raison: 'bloque', bloquants: [expect.stringContaining('hors du séjour')] });
    expect(p.statut).toBe('prete');
  });

  it('envoie quand tout est vérifié : statut envoyee, au nom du conseiller', async () => {
    await confirmerTout();
    expect(await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE })).toEqual({ ok: true, total: '358,00 €' });
    expect(p.statut).toBe('envoyee');
    expect(p.envoyee_par).toBe(ALICE);
    expect(repo.journal).toEqual(['a_verifier>prete', 'prete>envoyee']);
  });

  it('la base refuse les mêmes alertes bloquantes que le code', () => {
    const sql = readFileSync(join(__dirname, '../../supabase/migrations/20261020190000_tarifs_envoi.sql'), 'utf8');
    const liste = sql.match(/a ->> 'code' in \(([^)]*)\)/)![1]!.match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
    expect(liste).toEqual([...ALERTES_BLOQUANTES]);
  });
});
