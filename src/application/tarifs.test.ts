import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALERTES_BLOQUANTES } from '../../types';
import { TarifsEnMemoire, type LigneEnMemoire, type PropositionEnMemoire } from '../infrastructure/db/tarifsEnMemoire';
import { accepterVerification, confirmerTarif, envoyerProposition, marquerIndisponible, remplacerLigne, retirerLigne, revoirLigne, schemaTarif } from './tarifs';

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

describe('remplacer une ligne indisponible (E5.2)', () => {
  const presta = (id: string, nom: string, type: LigneEnMemoire['type'], destination: string, prix: number, capacite: number, actif = true) =>
    repo.catalogue.set(id, { id, nom, type, destination, prix_unitaire_cents: prix, capacite, actif });

  beforeEach(async () => {
    presta('train-nantes-01', 'Train Paris-Nantes', 'transport', 'Nantes', 4800, 8);
    presta('hotel-nantes-01', 'Hôtel des Machines', 'hebergement', 'Nantes', 9600, 6);
    presta('activite-nantes-01', 'Atelier de sérigraphie', 'activite', 'Nantes', 3500, 10);
    presta('activite-nantes-02', 'Balade sur l’Erdre', 'activite', 'Nantes', 2900, 12);
    presta('activite-nantes-03', 'Atelier fermé', 'activite', 'Nantes', 2000, 10, false);
    presta('activite-lyon-01', 'Jeu de piste à Lyon', 'activite', 'Lyon', 2900, 12);
    // train et hôtel confirmés au téléphone ; l'atelier est indisponible
    await confirmerTarif(repo, { ligneId: 'train', conseillerId: ALICE, montant: '50', source: 'telephone' });
    await confirmerTarif(repo, { ligneId: 'hotel', conseillerId: ALICE, montant: '96', source: 'mail' });
    await marquerIndisponible(repo, { ligneId: 'atelier', conseillerId: ALICE });
  });

  it('les autres lignes et leurs tarifs confirmés restent intacts', async () => {
    const avant = structuredClone(p.lignes.filter((l) => l.id !== 'atelier'));
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' });
    expect(r.ok).toBe(true);
    expect(p.lignes.filter((l) => l.id === 'train' || l.id === 'hotel')).toEqual(avant);
  });

  it('l’ancienne ligne passe à « remplacée », la nouvelle naît « à vérifier » au prix du catalogue, même date et mêmes participants', async () => {
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' });
    if (!r.ok || !('nouvelleLigneId' in r)) throw new Error('remplacement refusé');
    expect(p.lignes.find((l) => l.id === 'atelier')!.statut).toBe('remplacee');
    expect(p.lignes.find((l) => l.id === r.nouvelleLigneId)).toMatchObject({
      prestation_id: 'activite-nantes-02', statut: 'a_verifier', date: '2026-11-07', participants: 2,
      prix_unitaire_catalogue_cents: 2900, prix_confirme_cents: null,
    });
  });

  it('recalcule le total (sans la ligne remplacée) et laisse la proposition à vérifier', async () => {
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' });
    expect(r).toMatchObject({ ok: true, statutProposition: 'a_verifier' });
    expect(p.total_cents).toBe(5000 * 2 + 9600 * 2 + 2900 * 2); // 50 € et 96 € confirmés, balade au catalogue
  });

  it('recalcule les alertes avec la nouvelle ligne, et l’envoi reste bloqué tant qu’elle n’est pas vérifiée', async () => {
    await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02', date: '2026-11-09' });
    expect(p.alertes.map((a) => a.code)).toEqual(['date_hors_sejour']); // le 9 est après le séjour
    const envoi = await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE });
    expect(envoi).toMatchObject({ ok: false, raison: 'bloque' });
  });

  it('une fois la nouvelle ligne confirmée, la proposition est prête et s’envoie', async () => {
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' });
    if (!r.ok || !('nouvelleLigneId' in r)) throw new Error('remplacement refusé');
    await confirmerTarif(repo, { ligneId: r.nouvelleLigneId!, conseillerId: ALICE, montant: '29', source: 'lien' });
    expect(p.statut).toBe('prete');
    expect(await envoyerProposition(repo, { propositionId: P, conseillerId: ALICE })).toMatchObject({ ok: true });
  });

  it('ne remplace qu’une ligne indisponible', async () => {
    expect(await remplacerLigne(repo, { ligneId: 'train', conseillerId: ALICE, prestationId: 'activite-nantes-02' }))
      .toEqual({ ok: false, raison: 'transition_interdite' });
    expect(p.lignes).toHaveLength(3);
  });

  it('refuse une prestation retirée ou inconnue, sans rien écrire', async () => {
    for (const prestationId of ['activite-nantes-03', 'inconnue-99']) {
      expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId }))
        .toEqual({ ok: false, raison: 'prestation_refusee' });
    }
    expect(p.lignes.find((l) => l.id === 'atelier')!.statut).toBe('indisponible');
    expect(p.lignes).toHaveLength(3);
  });

  it('refuse une saisie invalide', async () => {
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: '', date: '7 novembre' });
    expect(r).toEqual({ ok: false, erreurs: { prestationId: 'Choisissez une prestation du catalogue', date: 'Date au format AAAA-MM-JJ' } });
  });

  it('refuse après l’envoi, et sans conseiller identifié', async () => {
    p.statut = 'envoyee';
    expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' }))
      .toEqual({ ok: false, raison: 'proposition_figee' });
    p.statut = 'a_verifier';
    expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ' ', prestationId: 'activite-nantes-02' }))
      .toEqual({ ok: false, raison: 'transition_interdite' });
  });

  it('reprend la même prestation à une autre date (complet ce jour-là)', async () => {
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-01', date: '2026-11-08' });
    if (!r.ok || !('nouvelleLigneId' in r)) throw new Error('remplacement refusé');
    expect(p.lignes.find((l) => l.id === r.nouvelleLigneId)).toMatchObject({ prestation_id: 'activite-nantes-01', date: '2026-11-08', statut: 'a_verifier' });
  });

  it('refuse la même prestation à la même date : rien ne changerait', async () => {
    expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-01' }))
      .toEqual({ ok: false, raison: 'meme_prestation' });
    expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-01', date: '2026-11-07' }))
      .toEqual({ ok: false, raison: 'meme_prestation' });
    expect(p.lignes).toHaveLength(3);
  });

  it('propose la même prestation d’abord, puis le même type, puis le reste de la destination, sans les prestations retirées', async () => {
    expect((await repo.prestationsRemplacantes('atelier')).map((x) => x.id))
      .toEqual(['activite-nantes-01', 'activite-nantes-02', 'hotel-nantes-01', 'train-nantes-01']);
  });
});

describe('prestation indisponible après le dépôt (E7.4)', () => {
  beforeEach(async () => {
    repo.catalogue.set('activite-nantes-02', { id: 'activite-nantes-02', nom: 'Balade sur l’Erdre', type: 'activite', destination: 'Nantes', prix_unitaire_cents: 2900, capacite: 12, actif: true });
    await confirmerTout();
    p.statut = 'depot_recu'; // envoyée, acceptée, dépôt reçu
  });

  it('marque indisponible une ligne confirmée, sans repasser la proposition à vérifier', async () => {
    expect(await marquerIndisponible(repo, { ligneId: 'atelier', conseillerId: ALICE })).toEqual({ ok: true, statutProposition: 'depot_recu' });
    expect(p.total_cents).toBe(28800);
  });

  it('refuse le retour à vérifier après le dépôt', async () => {
    expect(await revoirLigne(repo, { ligneId: 'atelier', conseillerId: ALICE })).toEqual({ ok: false, raison: 'proposition_figee' });
  });

  it('remplace seulement avec l’accord du client, et la proposition reste au dépôt reçu', async () => {
    await marquerIndisponible(repo, { ligneId: 'atelier', conseillerId: ALICE });
    expect(await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02' }))
      .toEqual({ ok: false, raison: 'accord_client_requis' });
    const r = await remplacerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, prestationId: 'activite-nantes-02', accordClient: true });
    expect(r).toMatchObject({ ok: true, statutProposition: 'depot_recu' });
    expect(p.lignes.map((l) => l.statut)).toEqual(['confirme', 'confirme', 'remplacee', 'a_verifier']);
  });

  it('retire une ligne indisponible avec l’accord du client, hors total', async () => {
    await marquerIndisponible(repo, { ligneId: 'atelier', conseillerId: ALICE });
    expect(await retirerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, accordClient: false })).toEqual({ ok: false, raison: 'accord_client_requis' });
    expect(await retirerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, accordClient: true })).toEqual({ ok: true, statutProposition: 'depot_recu' });
    expect(p.lignes[2]!.statut).toBe('retiree');
    expect(p.total_cents).toBe(28800);
  });

  it('ne retire ni une ligne confirmée ni la dernière prestation', async () => {
    expect(await retirerLigne(repo, { ligneId: 'train', conseillerId: ALICE, accordClient: true })).toEqual({ ok: false, raison: 'transition_interdite' });
    for (const id of ['train', 'hotel', 'atelier']) await marquerIndisponible(repo, { ligneId: id, conseillerId: ALICE });
    await retirerLigne(repo, { ligneId: 'train', conseillerId: ALICE, accordClient: true });
    await retirerLigne(repo, { ligneId: 'hotel', conseillerId: ALICE, accordClient: true });
    expect(await retirerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, accordClient: true })).toEqual({ ok: false, raison: 'derniere_ligne' });
  });

  it('ne retire rien avant le dépôt : on remplace, ou on repasse à vérifier', async () => {
    p.statut = 'prete';
    await marquerIndisponible(repo, { ligneId: 'atelier', conseillerId: ALICE });
    expect(await retirerLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, accordClient: true })).toEqual({ ok: false, raison: 'proposition_figee' });
  });
});

