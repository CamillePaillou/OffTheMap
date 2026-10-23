import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FicheIA, schemaBrouillon } from '../../../types';
import type { CodeAlerte } from '../../../types';
import { chiffrer, ecartVerification, ErreurChiffrage, formaterMontant, nuitsDesHebergements, valeursDeReference } from './chiffrer';
import type { EntreeChiffrage, LigneAChiffrer } from './chiffrer';

interface Cas { id: string; titre: string; entree: EntreeChiffrage; attendu: { totaux_lignes_cents: number[]; total_cents: number; alertes: CodeAlerte[] } }
const exemples = JSON.parse(readFileSync(join(__dirname, '../../../docs/specs/chiffrage-exemples.json'), 'utf8')) as { cas: Cas[] };

const casA = () => structuredClone(exemples.cas.find((c) => c.id === 'A')!.entree);
const ligne = (e: EntreeChiffrage, prestation: string) => e.lignes.find((l) => l.prestation_id === prestation)! as LigneAChiffrer;

describe('les exemples du document de règles donnent le prix attendu', () => {
  it.each(exemples.cas.map((c) => [`${c.id} · ${c.titre}`, c] as const))('%s', (_titre, c) => {
    const r = chiffrer(c.entree);
    expect(r.totaux_lignes_cents).toEqual(c.attendu.totaux_lignes_cents);
    expect(r.total_cents).toBe(c.attendu.total_cents);
    expect(r.codes).toEqual(c.attendu.alertes);
  });
});

describe('un tarif absent ou ancien reste « à vérifier », sans montant estimé', () => {
  it('scénario : une ligne non confirmée garde son statut et la copie du catalogue, et bloque l’envoi', () => {
    const r = chiffrer(casA());
    expect(r.total_cents).toBe(35800); // 48 + 96 + 35 € × 2 : uniquement des copies du catalogue
    expect(r.alertes).toEqual([]);
    expect(r.envoi_bloque).toBe(true); // tant qu'une ligne est à vérifier
  });

  it('le prix confirmé remplace la copie du catalogue', () => {
    const e = casA();
    Object.assign(ligne(e, 'activite-nantes-01'), { prix_confirme_cents: 4000, statut: 'confirme' });
    expect(chiffrer(e).totaux_lignes_cents[2]).toBe(8000);
  });

  it('un tarif absent n’est jamais remplacé par 0 : la proposition n’est pas chiffrée', () => {
    for (const absent of [undefined, null, Number.NaN, -1, 35.5]) {
      const e = casA();
      (ligne(e, 'activite-nantes-01') as unknown as Record<string, unknown>).prix_unitaire_catalogue_cents = absent;
      expect(() => chiffrer(e)).toThrowError(ErreurChiffrage);
      expect(() => chiffrer(e)).toThrowError(/ligne 3 \(activite-nantes-01\) : tarif catalogue absent ou invalide/);
    }
  });

  it('un prix confirmé invalide est refusé', () => {
    const e = casA();
    Object.assign(ligne(e, 'activite-nantes-01'), { prix_confirme_cents: 40.5, statut: 'confirme' });
    expect(() => chiffrer(e)).toThrowError(/prix confirmé invalide/);
  });

  it('toutes les lignes confirmées et aucune alerte bloquante : l’envoi est possible', () => {
    const e = casA();
    for (const l of e.lignes as LigneAChiffrer[]) Object.assign(l, { prix_confirme_cents: l.prix_unitaire_catalogue_cents, statut: 'confirme' });
    expect(chiffrer(e).envoi_bloque).toBe(false);
  });
});

describe('capacité, voyageurs, dates et catalogue contrôlés', () => {
  it('une alerte par ligne, avec son identifiant et un message lisible', () => {
    const e = casA();
    Object.assign(ligne(e, 'train-nantes-01'), { id: 'l-train', participants: 9 });
    const r = chiffrer(e);
    expect(r.alertes).toEqual(expect.arrayContaining([
      { code: 'capacite_depassee', ligne_id: 'l-train', message: 'train-nantes-01 : 9 participants pour une capacité de 8' },
      { code: 'participants_superieurs_voyageurs', ligne_id: 'l-train', message: 'train-nantes-01 : 9 participants pour 2 voyageurs' },
    ]));
    expect(r.envoi_bloque).toBe(true);
  });

  it('une prestation retirée du catalogue est signalée et bloque', () => {
    const e = casA();
    ligne(e, 'activite-nantes-01').actif = false;
    const r = chiffrer(e);
    expect(r.codes).toContain('prestation_inactive');
    expect(r.envoi_bloque).toBe(true);
  });

  it('activité et transport : le dernier jour est dans le séjour ; avant le premier jour, non', () => {
    const e = casA();
    ligne(e, 'activite-nantes-01').date = '2026-11-08';
    expect(chiffrer(e).codes).toEqual([]);
    ligne(e, 'train-nantes-01').date = '2026-11-06';
    expect(chiffrer(e).codes).toEqual(['date_hors_sejour']);
  });

  it('une ligne remplacée n’est ni contrôlée ni comptée, mais garde son total', () => {
    const e = casA();
    Object.assign(ligne(e, 'activite-nantes-01'), { statut: 'remplacee', participants: 30, actif: false });
    const r = chiffrer(e);
    expect(r.codes).toEqual([]);
    expect(r.totaux_lignes_cents[2]).toBe(105000);
    expect(r.total_cents).toBe(28800);
  });

  it('une ligne indisponible est contrôlée, sort du total et bloque l’envoi', () => {
    const e = casA();
    Object.assign(ligne(e, 'activite-nantes-01'), { statut: 'indisponible', actif: false });
    const r = chiffrer(e);
    expect(r.codes).toEqual(['prestation_inactive']);
    expect(r.total_cents).toBe(28800);
    expect(r.envoi_bloque).toBe(true);
  });

  it('une entrée invalide est refusée plutôt que chiffrée', () => {
    expect(() => chiffrer({ ...casA(), date_fin: '2026-11-06' })).toThrowError(/séjour invalide/);
    expect(() => chiffrer({ ...casA(), voyageurs: 0 })).toThrowError(/voyageurs/);
    expect(() => chiffrer({ ...casA(), budget_reference_cents: 0 })).toThrowError(/budget/);
  });
});

describe('budget global, comparé au total', () => {
  const avecBudget = (budget: number | null) => ({ ...casA(), budget_reference_cents: budget }); // total : 35 800

  it('frontière des 90 %, calculée en entiers', () => {
    expect(chiffrer(avecBudget(39777)).codes).toEqual(['budget_proche']); // 35 800 ≥ 90 % de 39 777 (35 799,3)
    expect(chiffrer(avecBudget(39778)).codes).toEqual([]); // 35 800 < 90 % de 39 778 (35 800,2)
  });

  it('total égal au budget : proche, pas dépassé ; un centime de moins : dépassé', () => {
    expect(chiffrer(avecBudget(35800)).codes).toEqual(['budget_proche']);
    expect(chiffrer(avecBudget(35799)).codes).toEqual(['budget_depasse']);
  });

  it('les alertes de budget informent sans bloquer, avec les montants en euros', () => {
    const r = chiffrer(avecBudget(35799));
    expect(r.alertes).toEqual([{ code: 'budget_depasse', message: 'Total 358,00\u00a0€ pour un budget de 357,99\u00a0€' }]);
    const proche = chiffrer(avecBudget(39000)).alertes[0]!;
    expect(proche.message).toBe('Total 358,00\u00a0€, soit 91 % du budget de 390,00\u00a0€');
  });

  it('sans budget de référence : aucune alerte de budget', () => {
    expect(chiffrer(avecBudget(null)).codes).toEqual([]);
  });
});

describe('valeurs de référence : la fiche l’emporte sur la demande', () => {
  const demande = { date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_annonce_cents: 40000 };

  it('sans fiche corrigée : les valeurs de la demande', () => {
    expect(valeursDeReference(demande, null)).toEqual({ date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_reference_cents: 40000 });
  });

  it('avec une fiche corrigée : dates fixes, nuits fixes et budget réel', () => {
    const fiche = { date_debut_fixe: '2026-11-14', date_fin_fixe: '2026-11-16', nb_nuits_fixe: 2, budget_reel_cents: 55000 };
    expect(valeursDeReference(demande, fiche)).toEqual({ date_debut: '2026-11-14', date_fin: '2026-11-16', nb_nuits: 2, budget_reference_cents: 55000 });
  });

  it('une seule date fixe ne suffit pas ; budget annoncé absent : pas de budget', () => {
    const fiche = { date_debut_fixe: '2026-11-14', date_fin_fixe: null, nb_nuits_fixe: null, budget_reel_cents: null };
    expect(valeursDeReference({ ...demande, budget_annonce_cents: null }, fiche)).toEqual({
      date_debut: '2026-11-07', date_fin: '2026-11-08', nb_nuits: 1, budget_reference_cents: null,
    });
  });
});

describe('écart après vérification et affichage', () => {
  it('prix revérifié − catalogue, par personne et pour la ligne ; positif = plus cher', () => {
    expect(ecartVerification(3500, 4000, 2)).toEqual({ par_personne_cents: 500, ligne_cents: 1000 });
    expect(ecartVerification(3500, 3000, 2)).toEqual({ par_personne_cents: -500, ligne_cents: -1000 });
  });

  it('affiche en français, avec une espace insécable avant €', () => {
    expect(formaterMontant(35800)).toBe('358,00\u00a0€');
  });
});

describe('un montant dans le texte généré est refusé', () => {
  it('dans le programme d’un brouillon', () => {
    const brouillon = {
      programme: [{ date: '2026-11-07', titre: 'Jour 1', texte: 'Atelier de sérigraphie à 35 € par personne.' }],
      lignes: [{ prestation_id: 'activite-nantes-01', date: '2026-11-07', participants: 2 }],
      ecartes: [],
    };
    const r = schemaBrouillon(['activite-nantes-01'], 2).safeParse(brouillon);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('montant interdit dans le texte');
  });

  it('dans une fiche, quelle que soit l’écriture du montant', () => {
    for (const texte of ['budget de 400 €', '400 euros', '35,50 EUR']) {
      const fiche = { envies: [texte], contraintes: [], regimes: [], mobilite: null, niveau_physique: null, points_flous: [] };
      expect(FicheIA.safeParse(fiche).success).toBe(false);
    }
  });
});

describe('nuits d’une ligne d’hébergement', () => {
  const hotel = (e: EntreeChiffrage) => ligne(e, 'hotel-nantes-01');

  it('total de la ligne = prix × participants × nuits ; les nuits couvertes comptent pour la cohérence', () => {
    const e = { ...casA(), date_fin: '2026-11-10', nb_nuits: 3 };
    hotel(e).nb_nuits = 3;
    const r = chiffrer(e);
    expect(r.totaux_lignes_cents[1]).toBe(9600 * 2 * 3);
    expect(r.codes).not.toContain('nuits_incoherentes');
  });

  it('une dernière nuit au-delà de la veille du départ est hors du séjour', () => {
    const e = casA(); // départ le 7, retour le 8 : une nuit
    hotel(e).nb_nuits = 2;
    expect(chiffrer(e).alertes).toContainEqual(expect.objectContaining({ code: 'date_hors_sejour', message: expect.stringContaining('du 2026-11-07 au 2026-11-08') }));
  });

  it('plusieurs nuits pour une activité, ou des nuits invalides : la proposition n’est pas chiffrée', () => {
    for (const [prestation, nuits] of [['activite-nantes-01', 2], ['hotel-nantes-01', 0], ['hotel-nantes-01', 15], ['hotel-nantes-01', 1.5]] as const) {
      const e = casA();
      ligne(e, prestation).nb_nuits = nuits;
      expect(() => chiffrer(e)).toThrowError(ErreurChiffrage);
    }
  });

  it('brouillon : chaque hôtel court jusqu’au prochain, ou jusqu’à la veille du départ', () => {
    const l = (type: 'hebergement' | 'activite' | 'transport', date: string) => ({ type, date });
    // une seule ligne d'hôtel pour 5 nuits
    expect(nuitsDesHebergements([l('transport', '2026-11-07'), l('hebergement', '2026-11-07'), l('activite', '2026-11-08')], '2026-11-12')).toEqual([1, 5, 1]);
    // changement d'hôtel le 9 : 2 nuits puis 3
    expect(nuitsDesHebergements([l('hebergement', '2026-11-09'), l('hebergement', '2026-11-07')], '2026-11-12')).toEqual([3, 2]);
    // au moins une nuit, même placé le jour du départ (l'alerte date_hors_sejour le signale)
    expect(nuitsDesHebergements([l('hebergement', '2026-11-12')], '2026-11-12')).toEqual([1]);
  });

  it('écart revérifié sur une ligne de plusieurs nuits', () => {
    expect(ecartVerification(9600, 9900, 2, 3)).toEqual({ par_personne_cents: 300, ligne_cents: 1800 });
  });
});
