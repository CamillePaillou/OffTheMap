/**
 * Rappels quand le client ne répond pas (E6.4) : règle pure, sans écriture. Spécification : docs/specs/rappels.md.
 * Une proposition envoyée sans réponse du client donne un rappel au conseiller à J+3 (elle passe alors en
 * sans_reponse), puis à J+7. Les jours sont des jours pleins (24 h) comptés depuis envoyee_le.
 */
export const JOURS_RAPPEL = [3, 7] as const;
export type JourRappel = (typeof JOURS_RAPPEL)[number];

const UN_JOUR_MS = 24 * 60 * 60 * 1000;

/** Jours pleins écoulés depuis `depuis` (instant ISO-8601). */
export const joursDepuis = (depuis: string, maintenant: Date) => Math.floor((maintenant.getTime() - new Date(depuis).getTime()) / UN_JOUR_MS);

/**
 * Le rappel à journaliser maintenant, ou null. Seul le jour atteint le plus tardif compte : une proposition
 * restée 8 jours sans passage du code reçoit le rappel J+7, pas J+3 puis J+7 d'un coup.
 */
export function rappelDu(envoyeeLe: string, faits: readonly number[], maintenant: Date): JourRappel | null {
  const jours = joursDepuis(envoyeeLe, maintenant);
  const atteint = [...JOURS_RAPPEL].reverse().find((j) => jours >= j);
  if (atteint === undefined || faits.some((f) => f >= atteint)) return null;
  return atteint;
}
