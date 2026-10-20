/**
 * Chiffrage d'une proposition (E4.2). Règles : docs/specs/chiffrage.md ; exemples : docs/specs/chiffrage-exemples.json.
 * Le prix est calculé par le code, jamais par l'IA : le brouillon fournit des prestations, des dates
 * et des participants, cette fonction fait le reste.
 *
 * Règle pure, sans dépendance : centimes entiers, aucune division, donc aucun arrondi.
 * Une valeur absente ou invalide n'est jamais remplacée par 0 : elle lève `ErreurChiffrage`.
 */
import { ALERTES_BLOQUANTES, REGLES_CHIFFRAGE } from '../../../types';
import type { Alerte, CodeAlerte, StatutLigne, TypePrestation } from '../../../types';

export interface LigneAChiffrer {
  /** Absent avant l'écriture en base ; repris dans les alertes de la ligne. */
  id?: string;
  prestation_id: string;
  type: TypePrestation;
  /** Capacité fixe du catalogue (les places restantes sont l'affaire de l'agent). */
  capacite: number;
  actif: boolean;
  date: string; // AAAA-MM-JJ
  participants: number;
  /** Copie figée du catalogue à la création de la ligne. */
  prix_unitaire_catalogue_cents: number;
  prix_confirme_cents: number | null;
  statut: StatutLigne;
}

export interface EntreeChiffrage {
  voyageurs: number;
  /** Séjour de référence : dates fixes de la fiche, sinon dates de la demande (voir `valeursDeReference`). */
  date_debut: string;
  date_fin: string;
  /** Nuits de référence : fixées par la fiche, sinon demandées. */
  nb_nuits: number;
  /** Budget global du groupe : réel, sinon annoncé, sinon `null` (pas d'alerte de budget). */
  budget_reference_cents: number | null;
  lignes: readonly LigneAChiffrer[];
}

export interface ResultatChiffrage {
  /** Un total par ligne, dans l'ordre, y compris les lignes hors total (comme la colonne calculée en base). */
  totaux_lignes_cents: number[];
  /** Somme des lignes, hors `remplacee` et `indisponible`, plus la marge (nulle). */
  total_cents: number;
  /** À écrire dans `propositions.alertes`. */
  alertes: Alerte[];
  /** Codes distincts, triés : la forme des exemples de docs/specs/chiffrage-exemples.json. */
  codes: CodeAlerte[];
  /** Vrai si une alerte bloquante existe, ou si une ligne du total est encore « à vérifier », ou une ligne indisponible. */
  envoi_bloque: boolean;
}

export class ErreurChiffrage extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurChiffrage';
  }
}

const HORS_TOTAL: readonly StatutLigne[] = REGLES_CHIFFRAGE.statutsHorsTotal;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function chiffrer(e: EntreeChiffrage): ResultatChiffrage {
  verifierEntree(e);

  const totaux = e.lignes.map(totalLigne);
  const total = totaux.reduce((s, t, i) => (HORS_TOTAL.includes(e.lignes[i]!.statut) ? s : s + t), 0) + REGLES_CHIFFRAGE.margeCents;

  const alertes: Alerte[] = [];
  const alerter = (code: CodeAlerte, message: string, l?: LigneAChiffrer) =>
    alertes.push({ code, message, ...(l?.id ? { ligne_id: l.id } : {}) });

  // Contrôles sur toutes les lignes sauf `remplacee`, y compris les indisponibles.
  const controlees = e.lignes.filter((l) => l.statut !== 'remplacee');
  const veilleDepart = jourPrecedent(e.date_fin);
  for (const l of controlees) {
    if (l.participants > l.capacite) {
      alerter('capacite_depassee', `${l.prestation_id} : ${l.participants} participants pour une capacité de ${l.capacite}`, l);
    }
    if (l.participants > e.voyageurs) {
      alerter('participants_superieurs_voyageurs', `${l.prestation_id} : ${l.participants} participants pour ${e.voyageurs} voyageurs`, l);
    }
    if (!l.actif) alerter('prestation_inactive', `${l.prestation_id} : prestation retirée du catalogue`, l);
    // Hébergement : du premier jour à la veille du départ ; activité et transport : jusqu'au dernier jour inclus.
    const fin = l.type === 'hebergement' ? veilleDepart : e.date_fin;
    if (l.date < e.date_debut || l.date > fin) {
      alerter('date_hors_sejour', `${l.prestation_id} : le ${l.date}, hors du séjour (${e.date_debut} → ${fin})`, l);
    }
  }

  const nuits = new Set(controlees.filter((l) => l.type === 'hebergement').map((l) => l.date)).size;
  if (nuits !== e.nb_nuits) alerter('nuits_incoherentes', `${nuits} nuit(s) d’hébergement pour ${e.nb_nuits} prévue(s)`);

  const budget = e.budget_reference_cents;
  if (budget !== null) {
    if (total > budget) {
      alerter('budget_depasse', `Total ${formaterMontant(total)} pour un budget de ${formaterMontant(budget)}`);
    } else if (atteintSeuil(total, budget)) {
      alerter('budget_proche', `Total ${formaterMontant(total)}, soit ${Math.floor((total * 100) / budget)} % du budget de ${formaterMontant(budget)}`);
    }
  }

  const codes = [...new Set(alertes.map((a) => a.code))].sort();
  const lignesBloquantes = e.lignes.some((l) => l.statut === 'indisponible' || l.statut === 'a_verifier');
  return {
    totaux_lignes_cents: totaux,
    total_cents: total,
    alertes,
    codes,
    envoi_bloque: lignesBloquantes || codes.some((c) => ALERTES_BLOQUANTES.includes(c)),
  };
}

/** Prix unitaire utilisé : confirmé s'il existe, sinon la copie du catalogue. Jamais un prix estimé. */
export function prixUnitaire(l: Pick<LigneAChiffrer, 'prix_confirme_cents' | 'prix_unitaire_catalogue_cents'>): number {
  return l.prix_confirme_cents ?? l.prix_unitaire_catalogue_cents;
}

/** Identique à la colonne calculée `total_ligne_cents`. */
export function totalLigne(l: LigneAChiffrer): number {
  return prixUnitaire(l) * l.participants;
}

/** Écart après vérification : prix revérifié − prix catalogue. Positif = plus cher. */
export function ecartVerification(catalogueCents: number, reverifieCents: number, participants: number) {
  const parPersonne = reverifieCents - catalogueCents;
  return { par_personne_cents: parPersonne, ligne_cents: parPersonne * participants };
}

/** « 358,00 € » (espace insécable U+00A0 avant €). */
export function formaterMontant(cents: number): string {
  return new Intl.NumberFormat(REGLES_CHIFFRAGE.locale, { style: 'currency', currency: REGLES_CHIFFRAGE.devise }).format(cents / 100);
}

/**
 * Valeurs de référence (règles, section 3) : la fiche corrigée par le conseiller l'emporte sur la demande.
 * Le budget de référence est le budget réel, sinon l'annoncé, sinon aucun.
 */
export function valeursDeReference(
  demande: { date_debut: string; date_fin: string; nb_nuits: number; budget_annonce_cents: number | null },
  fiche: { date_debut_fixe: string | null; date_fin_fixe: string | null; nb_nuits_fixe: number | null; budget_reel_cents: number | null } | null,
): Pick<EntreeChiffrage, 'date_debut' | 'date_fin' | 'nb_nuits' | 'budget_reference_cents'> {
  const datesFixes = fiche?.date_debut_fixe && fiche.date_fin_fixe;
  return {
    date_debut: datesFixes ? fiche.date_debut_fixe! : demande.date_debut,
    date_fin: datesFixes ? fiche.date_fin_fixe! : demande.date_fin,
    nb_nuits: fiche?.nb_nuits_fixe ?? demande.nb_nuits,
    budget_reference_cents: fiche?.budget_reel_cents ?? demande.budget_annonce_cents ?? null,
  };
}

// ------------------------------------------------------------------ interne

/** total ≥ seuil × budget, en entiers : 0,9 devient 90 %, pour éviter les arrondis des flottants. */
function atteintSeuil(total: number, budget: number): boolean {
  return total * 100 >= Math.round(REGLES_CHIFFRAGE.seuilBudgetProche * 100) * budget;
}

function jourPrecedent(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

const entierPositifOuNul = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

function verifierEntree(e: EntreeChiffrage): void {
  if (!Number.isInteger(e.voyageurs) || e.voyageurs < 1) throw new ErreurChiffrage(`nombre de voyageurs invalide : ${e.voyageurs}`);
  if (!DATE.test(e.date_debut) || !DATE.test(e.date_fin) || e.date_fin < e.date_debut) {
    throw new ErreurChiffrage(`séjour invalide : ${e.date_debut} → ${e.date_fin}`);
  }
  if (!entierPositifOuNul(e.nb_nuits)) throw new ErreurChiffrage(`nombre de nuits invalide : ${e.nb_nuits}`);
  if (e.budget_reference_cents !== null && !(entierPositifOuNul(e.budget_reference_cents) && e.budget_reference_cents > 0)) {
    throw new ErreurChiffrage(`budget invalide : ${e.budget_reference_cents}`);
  }
  e.lignes.forEach((l, i) => {
    const ou = `ligne ${i + 1} (${l.prestation_id})`;
    // Un tarif absent n'est jamais remplacé par 0 : la ligne ne peut pas être chiffrée.
    if (!entierPositifOuNul(l.prix_unitaire_catalogue_cents)) throw new ErreurChiffrage(`${ou} : tarif catalogue absent ou invalide`);
    if (l.prix_confirme_cents !== null && !entierPositifOuNul(l.prix_confirme_cents)) throw new ErreurChiffrage(`${ou} : prix confirmé invalide`);
    if (!Number.isInteger(l.participants) || l.participants < 1) throw new ErreurChiffrage(`${ou} : participants invalides`);
    if (!DATE.test(l.date)) throw new ErreurChiffrage(`${ou} : date invalide`);
  });
}
