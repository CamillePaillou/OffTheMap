/**
 * Ce que le chatbot affiche autour de sa réponse (E1.3), calculé par le code et non par le modèle :
 * - les cartes des prestations dont il parle (nom, ville, type, une ligne de description, disponibilité vérifiée) ;
 * - deux ou trois réponses rapides adaptées à la conversation, formulées pour être comprises sans le modèle.
 * Aucun prix ici : le catalogue arrive déjà sans prix.
 */
import { DESTINATIONS, type PrestationVisible } from './outils';

export interface CartePrestation {
  id: string;
  nom: string;
  type: PrestationVisible['type'];
  destination: string;
  description?: string;
  /** Résultat d'une vérification faite pendant ce message, s'il y en a eu une pour cette prestation. */
  disponibilite?: { disponible: boolean; date: string; participants: number };
}

export const CARTES_MAX = 4;

const PRIORITE: Record<PrestationVisible['type'], number> = { activite: 0, hebergement: 1, transport: 2 };
/**
 * Les cartes à montrer : les activités d'abord, puis les hébergements, le train en dernier ; et une ville de chaque
 * avant d'en montrer deux de la même, pour que la vue d'ensemble couvre toutes les destinations.
 */
export function choisirCartes(prestations: readonly PrestationVisible[], max = CARTES_MAX): CartePrestation[] {
  const triees = [...prestations].sort((a, b) => PRIORITE[a.type] - PRIORITE[b.type]);
  const choisies: PrestationVisible[] = [];
  const villesVues = new Set<string>();
  for (const p of triees) {
    if (villesVues.has(p.destination)) continue;
    villesVues.add(p.destination);
    choisies.push(p);
  }
  for (const p of triees) if (!choisies.includes(p)) choisies.push(p);
  return choisies.slice(0, max).map(versCarte);
}

/** « Trajet fictif aller-retour depuis Paris » → « Trajet aller-retour depuis Paris » : « fictif » vient du catalogue de cours. */
export function nettoyerDescription(description: string | undefined): string | undefined {
  const d = description
    ?.replace(/\s*\bfictif\b|\s*\bfictive\b/gi, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : undefined;
}

export const versCarte = (p: PrestationVisible): CartePrestation => {
  const description = nettoyerDescription(p.description);
  return { id: p.id, nom: p.nom, type: p.type, destination: p.destination, ...(description ? { description } : {}) };
};

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** AAAA-MM-JJ → « 7 novembre » : la forme que le chatbot comprend aussi en retour. */
export const dateParlee = (iso: string) => `${Number(iso.slice(8, 10))} ${MOIS[Number(iso.slice(5, 7)) - 1]}`;
const plusJours = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** Le prochain samedi (au moins 3 jours plus tard : le temps de composer). */
export function prochainSamedi(aujourdhui: string): string {
  let d = plusJours(aujourdhui, 3);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = plusJours(d, 1);
  return d;
}

export interface Contexte {
  aujourdhui: string;
  destination?: string | null;
  /** Types des prestations montrées en cartes. */
  types: readonly PrestationVisible['type'][];
  date?: string;
  voyageurs?: number;
  verification: 'disponible' | 'indisponible' | 'non_verifie' | null;
}

/** Deux ou trois réponses rapides, jamais sur un prix ni une réservation. */
export function relancesPour(c: Contexte): string[] {
  const ville = c.destination && (DESTINATIONS as readonly string[]).includes(c.destination) ? c.destination : null;
  const qui = c.voyageurs ?? 2;
  if (!ville) return ['Que faire à Nantes ?', 'Où dormir à Lyon ?', 'Une activité quand il pleut ?'];

  const autreVille = DESTINATIONS.find((v) => v !== ville)!;
  const complement = c.types.includes('hebergement') && !c.types.includes('activite') ? `Que faire à ${ville} ?` : `Où dormir à ${ville} ?`;

  if (c.verification === 'disponible' && c.date) return [complement, `Et le ${dateParlee(plusJours(c.date, 7))} ?`, `Et à ${autreVille} ?`];
  if (c.verification === 'indisponible' && c.date) return [`Et le ${dateParlee(plusJours(c.date, 1))} ?`, complement, `Et à ${autreVille} ?`];
  return [`Libre le ${dateParlee(c.date ?? prochainSamedi(c.aujourdhui))} pour ${qui} ?`, complement, `Et à ${autreVille} ?`];
}
