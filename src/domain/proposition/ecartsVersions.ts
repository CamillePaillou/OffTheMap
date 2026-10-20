/**
 * Ce qui a changé entre deux versions d'une proposition (E6.2). Spécification : docs/specs/ecarts-versions.md.
 * Règle pure, sur le payload du dashboard : la comparaison se fait par prestation, pour qu'une nuit d'hôtel ajoutée
 * se lise « hôtel : 1 → 2 nuits » et non « une ligne retirée, deux lignes ajoutées ».
 *
 * Seules les lignes retenues comptent (ni remplacées ni indisponibles), comme dans le total (REGLES_CHIFFRAGE). Le prix
 * d'une ligne est son prix effectif : confirmé, sinon catalogue. Les écarts sont recalculés à chaque lecture : la
 * version suivante change tant que ses prix ne sont pas confirmés.
 */
import { REGLES_CHIFFRAGE } from '../../../types/chiffrage';
import type { LigneProposition } from '../../../types/dashboard';
import type { TypePrestation } from '../../../types/enums';

type LigneComparee = Pick<LigneProposition, 'date' | 'participants' | 'prix_unitaire_catalogue_cents' | 'prix_confirme' | 'statut' | 'total_ligne_cents'> & {
  prestation: Pick<LigneProposition['prestation'], 'id' | 'nom' | 'type'>;
};

export interface VersionComparee {
  version: number;
  lignes: readonly LigneComparee[];
}

/** Une prestation dans une version : ses lignes retenues, résumées. */
export interface CotePrestation {
  dates: string[]; // une par ligne, triées (un hébergement : une par nuit)
  participants: number[]; // valeurs distinctes, triées
  prix_unitaires_cents: number[]; // prix effectifs distincts, triés
  total_cents: number;
  prix_a_verifier: boolean; // au moins une ligne sans prix confirmé
}

export type Changement = 'dates' | 'participants' | 'prix';

export interface EcartPrestation {
  prestation_id: string;
  nom: string;
  type: TypePrestation;
  nature: 'ajoutee' | 'retiree' | 'modifiee';
  avant: CotePrestation | null; // null : absente de la version précédente
  apres: CotePrestation | null; // null : retirée
  changements: Changement[]; // vide pour une prestation ajoutée ou retirée
  delta_cents: number; // positif : plus cher
}

export interface EcartsVersions {
  version_avant: number;
  version_apres: number;
  total_avant_cents: number;
  total_apres_cents: number;
  delta_total_cents: number; // = somme des delta_cents
  prestations: EcartPrestation[]; // seulement celles qui ont changé
  inchangees: number;
  prix_a_verifier: boolean; // la version suivante a encore des prix catalogue
}

const HORS_TOTAL: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal;
const distincts = (valeurs: number[]) => [...new Set(valeurs)].sort((a, b) => a - b);
const egaux = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function parPrestation(lignes: readonly LigneComparee[]) {
  const groupes = new Map<string, { nom: string; type: TypePrestation; lignes: LigneComparee[] }>();
  for (const l of lignes) {
    if (HORS_TOTAL.includes(l.statut)) continue;
    const g = groupes.get(l.prestation.id) ?? { nom: l.prestation.nom, type: l.prestation.type, lignes: [] };
    g.lignes.push(l);
    groupes.set(l.prestation.id, g);
  }
  return groupes;
}

function cote(lignes: LigneComparee[]): CotePrestation {
  return {
    dates: lignes.map((l) => l.date).sort(),
    participants: distincts(lignes.map((l) => l.participants)),
    prix_unitaires_cents: distincts(lignes.map((l) => l.prix_confirme?.montant_cents ?? l.prix_unitaire_catalogue_cents)),
    total_cents: lignes.reduce((s, l) => s + l.total_ligne_cents, 0),
    prix_a_verifier: lignes.some((l) => l.prix_confirme === null),
  };
}

export function comparerVersions(avant: VersionComparee, apres: VersionComparee): EcartsVersions {
  const a = parPrestation(avant.lignes);
  const b = parPrestation(apres.lignes);
  const prestations: EcartPrestation[] = [];
  let inchangees = 0;

  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const ga = a.get(id);
    const gb = b.get(id);
    const ca = ga ? cote(ga.lignes) : null;
    const cb = gb ? cote(gb.lignes) : null;
    const { nom, type } = (gb ?? ga)!;
    const delta_cents = (cb?.total_cents ?? 0) - (ca?.total_cents ?? 0);

    if (!ca || !cb) {
      prestations.push({ prestation_id: id, nom, type, nature: ca ? 'retiree' : 'ajoutee', avant: ca, apres: cb, changements: [], delta_cents });
      continue;
    }
    const changements: Changement[] = [];
    if (!egaux(ca.dates, cb.dates)) changements.push('dates');
    if (!egaux(ca.participants, cb.participants)) changements.push('participants');
    if (!egaux(ca.prix_unitaires_cents, cb.prix_unitaires_cents)) changements.push('prix');
    if (changements.length === 0 && delta_cents === 0) inchangees++;
    else prestations.push({ prestation_id: id, nom, type, nature: 'modifiee', avant: ca, apres: cb, changements, delta_cents });
  }

  // dans l'ordre du séjour : première date, puis nom
  const premiere = (e: EcartPrestation) => (e.apres ?? e.avant)!.dates[0]!;
  prestations.sort((x, y) => premiere(x).localeCompare(premiere(y)) || x.nom.localeCompare(y.nom, 'fr'));

  const total = (g: ReturnType<typeof parPrestation>) => [...g.values()].reduce((s, x) => s + cote(x.lignes).total_cents, 0);
  const total_avant_cents = total(a);
  const total_apres_cents = total(b);
  return {
    version_avant: avant.version,
    version_apres: apres.version,
    total_avant_cents,
    total_apres_cents,
    delta_total_cents: total_apres_cents - total_avant_cents,
    prestations,
    inchangees,
    prix_a_verifier: [...b.values()].some((g) => cote(g.lignes).prix_a_verifier),
  };
}
