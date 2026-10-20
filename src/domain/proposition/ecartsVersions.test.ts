import { describe, expect, it } from 'vitest';
import type { TypePrestation } from '../../../types/enums';
import { comparerVersions, type VersionComparee } from './ecartsVersions';

type Ligne = VersionComparee['lignes'][number];
const PRESTATIONS: Record<string, { nom: string; type: TypePrestation; prix: number }> = {
  'train-nantes-01': { nom: 'Train vers Nantes', type: 'transport', prix: 4800 },
  'hotel-nantes-01': { nom: 'Hôtel des Machines', type: 'hebergement', prix: 9600 },
  'activite-nantes-01': { nom: 'Atelier de machines imaginaires', type: 'activite', prix: 3500 },
  'activite-nantes-02': { nom: 'Balade sur l’Erdre', type: 'activite', prix: 2900 },
};

/** Une ligne : prix catalogue du tableau ci-dessus, prix confirmé facultatif. */
const ligne = (id: string, date: string, o: { participants?: number; confirme?: number; statut?: Ligne['statut'] } = {}): Ligne => {
  const p = PRESTATIONS[id]!;
  const participants = o.participants ?? 2;
  const prix_confirme = o.confirme === undefined ? null : { montant_cents: o.confirme, source: 'agent' as const, le: '2026-10-14T12:00:00.000Z', par: 'Conseiller' };
  return {
    prestation: { id, nom: p.nom, type: p.type },
    date,
    participants,
    prix_unitaire_catalogue_cents: p.prix,
    prix_confirme,
    statut: o.statut ?? (prix_confirme ? 'confirme' : 'a_verifier'),
    total_ligne_cents: (o.confirme ?? p.prix) * participants,
  };
};

// Exemple connu (docs/specs/ecarts-versions.md) : la v1 envoyée, 368 € ; le client demande deux nuits au lieu d'une.
const V1: VersionComparee = {
  version: 1,
  lignes: [
    ligne('train-nantes-01', '2026-11-07', { confirme: 4800 }),
    ligne('hotel-nantes-01', '2026-11-07', { confirme: 9600 }),
    ligne('activite-nantes-01', '2026-11-07', { confirme: 4000 }),
  ],
};
// v2 créée par E6.1 : mêmes prestations au prix catalogue (atelier 35 €), une nuit d'hôtel en plus.
const V2: VersionComparee = {
  version: 2,
  lignes: [
    ligne('train-nantes-01', '2026-11-07'),
    ligne('hotel-nantes-01', '2026-11-07'),
    ligne('hotel-nantes-01', '2026-11-08'),
    ligne('activite-nantes-01', '2026-11-07'),
  ],
};

describe('écarts entre deux versions (E6.2)', () => {
  it('exemple connu : correspond au calcul manuel', () => {
    const e = comparerVersions(V1, V2);
    expect(e).toMatchObject({ version_avant: 1, version_apres: 2, total_avant_cents: 36800, total_apres_cents: 55000, delta_total_cents: 18200, inchangees: 1, prix_a_verifier: true });
    expect(e.prestations).toEqual([
      {
        prestation_id: 'activite-nantes-01', nom: 'Atelier de machines imaginaires', type: 'activite', nature: 'modifiee',
        avant: { dates: ['2026-11-07'], participants: [2], prix_unitaires_cents: [4000], total_cents: 8000, prix_a_verifier: false },
        apres: { dates: ['2026-11-07'], participants: [2], prix_unitaires_cents: [3500], total_cents: 7000, prix_a_verifier: true },
        changements: ['prix'], delta_cents: -1000,
      },
      {
        prestation_id: 'hotel-nantes-01', nom: 'Hôtel des Machines', type: 'hebergement', nature: 'modifiee',
        avant: { dates: ['2026-11-07'], participants: [2], prix_unitaires_cents: [9600], total_cents: 19200, prix_a_verifier: false },
        apres: { dates: ['2026-11-07', '2026-11-08'], participants: [2], prix_unitaires_cents: [9600], total_cents: 38400, prix_a_verifier: true },
        changements: ['dates'], delta_cents: 19200,
      },
    ]);
  });

  it('la somme des écarts par prestation donne l’écart du total', () => {
    const e = comparerVersions(V1, V2);
    expect(e.prestations.reduce((s, p) => s + p.delta_cents, 0)).toBe(e.delta_total_cents);
  });

  it('prestation ajoutée, retirée, participants changés', () => {
    const v3: VersionComparee = {
      version: 3,
      lignes: [
        ligne('train-nantes-01', '2026-11-07', { participants: 3, confirme: 4800 }),
        ligne('hotel-nantes-01', '2026-11-07', { confirme: 9600 }),
        ligne('activite-nantes-02', '2026-11-08', { confirme: 2900 }),
      ],
    };
    const e = comparerVersions(V1, v3);
    expect(e.prestations.map((p) => [p.prestation_id, p.nature, p.changements, p.delta_cents])).toEqual([
      ['activite-nantes-01', 'retiree', [], -8000],
      ['train-nantes-01', 'modifiee', ['participants'], 4800],
      ['activite-nantes-02', 'ajoutee', [], 5800],
    ]);
    expect(e).toMatchObject({ inchangees: 1, delta_total_cents: 2600, prix_a_verifier: false });
  });

  it('ignore les lignes remplacées ou indisponibles, comme le total', () => {
    const avec: VersionComparee = {
      version: 2,
      lignes: [...V1.lignes, ligne('activite-nantes-02', '2026-11-08', { statut: 'indisponible' }), ligne('activite-nantes-02', '2026-11-07', { statut: 'remplacee' })],
    };
    expect(comparerVersions(V1, avec)).toMatchObject({ prestations: [], inchangees: 3, delta_total_cents: 0 });
  });

  it('deux versions identiques : aucun écart', () => {
    expect(comparerVersions(V1, { ...V1, version: 2 })).toMatchObject({ prestations: [], inchangees: 3, delta_total_cents: 0, prix_a_verifier: false });
  });

  it('une date déplacée est un changement de dates, pas un retrait et un ajout', () => {
    const v2: VersionComparee = { version: 2, lignes: [V1.lignes[0]!, V1.lignes[1]!, ligne('activite-nantes-01', '2026-11-08', { confirme: 4000 })] };
    const [atelier] = comparerVersions(V1, v2).prestations;
    expect(atelier).toMatchObject({ nature: 'modifiee', changements: ['dates'], delta_cents: 0 });
  });
});
