import { beforeEach, describe, expect, it } from 'vitest';
import { comparerVersions, type VersionComparee } from '../domain/proposition/ecartsVersions';
import { TarifsEnMemoire, type LigneEnMemoire, type PropositionEnMemoire } from '../infrastructure/db/tarifsEnMemoire';
import { ajouterLigne, ajusterSejour, confirmerTarif, modifierBudget, modifierLigne, schemaModification } from './tarifs';

const P = 'v2';
const ALICE = 'alice';

// Version 2 créée par E6.1 après « deux nuits au lieu d'une » : 2 adultes à Nantes, prix confirmés ; séjour du 7 au 9.
function ligne(id: string, prestation_id: string, type: LigneEnMemoire['type'], prix: number): LigneEnMemoire {
  return {
    id, prestation_id, type, capacite: 8, actif: true, date: '2026-11-07', participants: 2, nb_nuits: 1, prix_unitaire_catalogue_cents: prix,
    prix_confirme_cents: prix, statut: 'confirme', source: 'agent', confirme_par: ALICE, verification: null,
  };
}

let repo: TarifsEnMemoire;
let p: PropositionEnMemoire;
beforeEach(() => {
  repo = new TarifsEnMemoire();
  p = {
    id: P, statut: 'prete', destination: 'Nantes', voyageurs: 2, date_debut: '2026-11-07', date_fin: '2026-11-09', nb_nuits: 2,
    budget_reference_cents: 60000, total_cents: 35800, alertes: [], envoyee_par: null,
    lignes: [
      ligne('train', 'train-nantes-01', 'transport', 4800),
      ligne('hotel', 'hotel-nantes-01', 'hebergement', 9600),
      ligne('atelier', 'activite-nantes-01', 'activite', 3500),
    ],
  };
  repo.propositions.set(P, p);
  for (const [id, type, nom, prix] of [
    ['train-nantes-01', 'transport', 'Train vers Nantes', 4800],
    ['hotel-nantes-01', 'hebergement', 'Hôtel des Machines', 9600],
    ['activite-nantes-01', 'activite', 'Atelier de machines imaginaires', 3500],
    ['activite-nantes-02', 'activite', 'Balade en bord de Loire', 2900],
  ] as const) repo.catalogue.set(id, { id, type, nom, prix_unitaire_cents: prix, capacite: 10, destination: 'Nantes', actif: true });
  repo.catalogue.set('activite-retiree', { id: 'activite-retiree', type: 'activite', nom: 'Atelier fermé', prix_unitaire_cents: 2000, capacite: 10, destination: 'Nantes', actif: false });
  repo.catalogue.set('hotel-lyon-01', { id: 'hotel-lyon-01', type: 'hebergement', nom: 'Hôtel de Lyon', prix_unitaire_cents: 8000, capacite: 10, destination: 'Lyon', actif: true });
});

const ajout = (prestationId: string, date = '2026-11-08', participants: unknown = '2') =>
  ajouterLigne(repo, { propositionId: P, conseillerId: ALICE, prestationId, date, participants });

describe('ajouter une prestation (E6.6)', () => {
  it('« deux nuits au lieu d’une » : une nuit d’hôtel le 8, à vérifier au prix du catalogue ; total et statut recalculés', async () => {
    const r = await ajout('hotel-nantes-01');
    expect(r).toMatchObject({ ok: true, statutProposition: 'a_verifier' });
    const nouvelle = p.lignes.find((l) => l.id === (r as { nouvelleLigneId: string }).nouvelleLigneId)!;
    expect(nouvelle).toMatchObject({ prestation_id: 'hotel-nantes-01', date: '2026-11-08', participants: 2, statut: 'a_verifier', prix_unitaire_catalogue_cents: 9600, prix_confirme_cents: null });
    expect(p.total_cents).toBe(35800 + 19200);
    expect(repo.journal).toEqual(['prete>a_verifier']);
    // les autres lignes gardent leur tarif confirmé
    expect(p.lignes.filter((l) => l.id !== nouvelle.id).every((l) => l.statut === 'confirme' && l.prix_confirme_cents !== null)).toBe(true);
    // 2 nuits d'hébergement pour 2 nuits prévues : plus d'alerte de nuits
    expect(p.alertes.map((a) => a.code)).not.toContain('nuits_incoherentes');
  });

  it('les écarts avec la version 1 (E6.2) montrent l’hôtel passer de 1 à 2 nuits', async () => {
    await ajout('hotel-nantes-01');
    const versVersion = (version: number, lignes: LigneEnMemoire[]): VersionComparee => ({
      version,
      lignes: lignes.map((l) => ({
        prestation: { id: l.prestation_id, nom: repo.catalogue.get(l.prestation_id)!.nom, type: l.type },
        date: l.date, participants: l.participants, prix_unitaire_catalogue_cents: l.prix_unitaire_catalogue_cents,
        prix_confirme: l.prix_confirme_cents === null ? null : { montant_cents: l.prix_confirme_cents, source: 'agent', le: '2026-10-22T10:00:00Z', par: ALICE },
        statut: l.statut, total_ligne_cents: (l.prix_confirme_cents ?? l.prix_unitaire_catalogue_cents) * l.participants,
      })),
    });
    const v1 = versVersion(1, [ligne('t', 'train-nantes-01', 'transport', 4800), ligne('h', 'hotel-nantes-01', 'hebergement', 9600), ligne('a', 'activite-nantes-01', 'activite', 3500)]);
    const e = comparerVersions(v1, versVersion(2, p.lignes));
    expect(e.prestations).toHaveLength(1);
    expect(e.prestations[0]).toMatchObject({ nom: 'Hôtel des Machines', nature: 'modifiee', changements: ['dates'], delta_cents: 19200 });
    expect(e.prestations[0]!.avant!.dates).toHaveLength(1);
    expect(e.prestations[0]!.apres!.dates).toEqual(['2026-11-07', '2026-11-08']);
  });

  it.each([
    ['prestation retirée du catalogue', () => ajout('activite-retiree'), { raison: 'prestation_refusee' }],
    ['prestation inconnue', () => ajout('inventee-01'), { raison: 'prestation_refusee' }],
    ['même prestation déjà prévue à cette date', () => ajout('hotel-nantes-01', '2026-11-07'), { raison: 'deja_prevue' }],
  ])('refuse : %s, sans rien créer', async (_cas, faire, attendu) => {
    expect(await faire()).toMatchObject({ ok: false, ...attendu });
    expect(p.lignes).toHaveLength(3);
  });

  it.each([
    ['sans prestation', { prestationId: '' }, 'prestationId'],
    ['sans date', { date: '' }, 'date'],
    ['zéro participant', { participants: '0' }, 'participants'],
    ['plus de 20 participants', { participants: '21' }, 'participants'],
    ['participants non entiers', { participants: '2,5' }, 'participants'],
  ])('refuse la saisie %s', async (_cas, surcharge, champ) => {
    const r = await ajouterLigne(repo, { propositionId: P, conseillerId: ALICE, prestationId: 'hotel-nantes-01', date: '2026-11-08', participants: '2', ...surcharge });
    expect(r.ok === false && 'erreurs' in r && r.erreurs[champ]).toBeTruthy();
    expect(p.lignes).toHaveLength(3);
  });

  it('refuse sur une proposition envoyée (figée)', async () => {
    p.statut = 'envoyee';
    expect(await ajout('hotel-nantes-01')).toEqual({ ok: false, raison: 'proposition_figee' });
  });

  it('propose les prestations actives de la destination, hébergements d’abord', async () => {
    expect((await repo.prestationsAjoutables(P)).map((x) => x.id)).toEqual(['hotel-nantes-01', 'train-nantes-01', 'activite-nantes-01', 'activite-nantes-02']);
  });
});

describe('séjour : « − » et « + » (E6.6)', () => {
  it('« deux nuits au lieu d’une » : la nuit d’hôtel du 8 cesse d’être hors du séjour, et les nuits redeviennent cohérentes', async () => {
    p.date_fin = '2026-11-08';
    p.nb_nuits = 1;
    await ajout('hotel-nantes-01');
    expect(p.alertes.map((a) => a.code)).toEqual(expect.arrayContaining(['date_hors_sejour', 'nuits_incoherentes']));

    expect(await ajusterSejour(repo, { propositionId: P, conseillerId: ALICE, delta: 1 })).toEqual({
      ok: true, sejour: { date_debut: '2026-11-07', date_fin: '2026-11-09', nb_nuits: 2 },
    });
    expect(p.alertes.map((a) => a.code)).not.toContain('date_hors_sejour');
    expect(p.alertes.map((a) => a.code)).not.toContain('nuits_incoherentes');
    expect(p.lignes).toHaveLength(4); // les lignes ne bougent pas
  });

  it('« − » ne descend pas sous zéro nuit ; une nuit à la fois ; refus sur une proposition envoyée', async () => {
    p.date_fin = '2026-11-07';
    p.nb_nuits = 0;
    expect(await ajusterSejour(repo, { propositionId: P, conseillerId: ALICE, delta: -1 })).toEqual({ ok: false, raison: 'sejour_impossible' });
    expect(await ajusterSejour(repo, { propositionId: P, conseillerId: ALICE, delta: 2 })).toEqual({ ok: false, raison: 'transition_interdite' });
    p.statut = 'envoyee';
    expect(await ajusterSejour(repo, { propositionId: P, conseillerId: ALICE, delta: 1 })).toEqual({ ok: false, raison: 'proposition_figee' });
    expect(p).toMatchObject({ date_fin: '2026-11-07', nb_nuits: 0 });
  });
});

describe('budget réel : « Modifier » (E6.6)', () => {
  it('le client accepte de payer plus : « budget dépassé » devient « budget presque atteint »', async () => {
    p.budget_reference_cents = 40000;
    await ajout('hotel-nantes-01'); // 550 € pour 400 €
    expect(p.alertes.map((a) => a.code)).toContain('budget_depasse');
    expect(await modifierBudget(repo, { propositionId: P, conseillerId: ALICE, budget: '600' })).toEqual({ ok: true });
    expect(p.budget_reference_cents).toBe(60000);
    expect(p.alertes.map((a) => a.code)).not.toContain('budget_depasse');
    expect(p.alertes.map((a) => a.code)).toContain('budget_proche'); // 550 / 600 = 91 %
  });

  it.each([['', 'Indiquez un budget'], ['0', 'Le budget doit être positif'], ['450,50', 'Budget en euros entiers'], ['quatre cents', 'Budget en euros entiers']])(
    'refuse « %s »',
    async (budget, message) => {
      expect(await modifierBudget(repo, { propositionId: P, conseillerId: ALICE, budget })).toEqual({ ok: false, erreurs: { budget: message } });
      expect(p.budget_reference_cents).toBe(60000);
    },
  );

  it('refuse sur une proposition envoyée', async () => {
    p.statut = 'envoyee';
    expect(await modifierBudget(repo, { propositionId: P, conseillerId: ALICE, budget: '700' })).toEqual({ ok: false, raison: 'proposition_figee' });
  });
});

describe('changer la date ou les participants d’une ligne (E6.6)', () => {
  it('participants changés : la ligne repasse à vérifier, sans prix confirmé ; les autres restent confirmées', async () => {
    const r = await modifierLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, date: '', participants: '3' });
    expect(r).toEqual({ ok: true, statutProposition: 'a_verifier' });
    expect(p.lignes[2]).toMatchObject({ participants: 3, date: '2026-11-07', statut: 'a_verifier', prix_confirme_cents: null, source: null, confirme_par: null });
    expect(p.lignes.slice(0, 2).every((l) => l.statut === 'confirme')).toBe(true);
    expect(p.total_cents).toBe(4800 * 2 + 9600 * 2 + 3500 * 3);
  });

  it('date déplacée, puis tarif confirmé à nouveau : la proposition redevient prête', async () => {
    await modifierLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, date: '2026-11-08', participants: '' });
    expect(p.lignes[2]).toMatchObject({ date: '2026-11-08', statut: 'a_verifier' });
    await confirmerTarif(repo, { ligneId: 'atelier', conseillerId: ALICE, montant: '35', source: 'telephone' });
    expect(p.statut).toBe('prete');
    expect(repo.journal).toEqual(['prete>a_verifier', 'a_verifier>prete']);
  });

  it.each([
    ['rien ne change', { date: '2026-11-07', participants: '2' }, { raison: 'deja_prevue' }],
    ['date déjà prévue pour la même prestation', { date: '2026-11-08', participants: '' }, { raison: 'deja_prevue' }],
  ])('refuse : %s', async (_cas, saisie, attendu) => {
    await ajout('hotel-nantes-01'); // une nuit le 8
    p.lignes[1]!.statut = 'confirme';
    const r = await modifierLigne(repo, { ligneId: 'hotel', conseillerId: ALICE, ...saisie });
    expect(r).toMatchObject({ ok: false, ...attendu });
    expect(p.lignes[1]).toMatchObject({ date: '2026-11-07', statut: 'confirme' });
  });

  it('refuse une ligne remplacée, et une proposition envoyée', async () => {
    p.lignes[2]!.statut = 'remplacee';
    expect(await modifierLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, date: '', participants: '3' })).toEqual({ ok: false, raison: 'transition_interdite' });
    p.statut = 'envoyee';
    expect(await modifierLigne(repo, { ligneId: 'train', conseillerId: ALICE, date: '', participants: '3' })).toEqual({ ok: false, raison: 'proposition_figee' });
  });

  it('« + » des participants : la ligne confirmée repasse à vérifier, comme avec le formulaire', async () => {
    expect(await modifierLigne(repo, { ligneId: 'train', conseillerId: ALICE, date: '', participants: '3' })).toMatchObject({ ok: true });
    expect(p.lignes[0]).toMatchObject({ participants: 3, statut: 'a_verifier', prix_confirme_cents: null });
  });

  it('nuits d’un hôtel : la ligne repasse à vérifier, son total suit (prix × participants × nuits)', async () => {
    expect(await modifierLigne(repo, { ligneId: 'hotel', conseillerId: ALICE, date: '', participants: '', nbNuits: '2' })).toMatchObject({ ok: true });
    expect(p.lignes[1]).toMatchObject({ nb_nuits: 2, statut: 'a_verifier', prix_confirme_cents: null });
    expect(p.total_cents).toBe(4800 * 2 + 9600 * 2 * 2 + 3500 * 2);
    expect(p.alertes.map((a) => a.code)).not.toContain('nuits_incoherentes'); // séjour de 2 nuits, couvert par la ligne
  });

  it('plusieurs nuits pour une activité : refusé, rien ne change', async () => {
    expect(await modifierLigne(repo, { ligneId: 'atelier', conseillerId: ALICE, date: '', participants: '', nbNuits: '2' })).toEqual({ ok: false, raison: 'nuits_refusees' });
    expect(p.lignes[2]).toMatchObject({ nb_nuits: 1, statut: 'confirme' });
  });

  it('il faut changer la date, les participants ou les nuits', () => {
    expect(schemaModification.safeParse({ date: '', participants: '', nbNuits: '' }).success).toBe(false);
    expect(schemaModification.parse({ date: '', participants: '', nbNuits: '3' })).toMatchObject({ nbNuits: 3 });
    expect(schemaModification.safeParse({ date: '', participants: '', nbNuits: '15' }).success).toBe(false);
    expect(schemaModification.parse({ date: '2026-11-08', participants: '' })).toEqual({ date: '2026-11-08', participants: undefined });
  });
});
