// Chemins de la connexion du conseiller (E0.11). Fonctions pures : utilisées par le proxy et la page de connexion.

export const PAGE_CONNEXION = '/connexion';
export const ESPACE_CONSEILLER = '/conseiller';

/** Vrai pour /conseiller et tout ce qui est en dessous ; ces pages exigent une connexion. */
export function estProtege(chemin: string): boolean {
  return chemin === ESPACE_CONSEILLER || chemin.startsWith(`${ESPACE_CONSEILLER}/`);
}

/** URL de la page de connexion, qui ramène ensuite vers la page demandée. */
export function urlConnexion(suite: string): string {
  return `${PAGE_CONNEXION}?suite=${encodeURIComponent(suite)}`;
}

/**
 * Où aller après la connexion. Seuls les chemins de l'espace conseiller sont acceptés,
 * pour qu'un lien piégé (?suite=https://ailleurs) ne puisse pas rediriger hors du site.
 */
export function suiteSure(suite: string | null | undefined): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//') || suite.includes('\\')) {
    return ESPACE_CONSEILLER;
  }
  const chemin = suite.split(/[?#]/)[0];
  return estProtege(chemin) ? suite : ESPACE_CONSEILLER;
}
