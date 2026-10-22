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

// Espace client (suivi de la demande) : compte facultatif. Les pages du compte exigent une session ; inscription,
// connexion, mot de passe oublié et confirmation restent ouvertes.
export const ESPACE_CLIENT = '/compte';
export const PAGE_CONNEXION_CLIENT = '/compte/connexion';
const PAGES_CLIENT_OUVERTES = ['/compte/connexion', '/compte/inscription', '/compte/mot-de-passe-oublie', '/compte/confirmer'];

/** Vrai pour /compte et ses pages, hors pages ouvertes (connexion, inscription…). */
export function estProtegeClient(chemin: string): boolean {
  if (PAGES_CLIENT_OUVERTES.some((p) => chemin === p || chemin.startsWith(`${p}/`))) return false;
  return chemin === ESPACE_CLIENT || chemin.startsWith(`${ESPACE_CLIENT}/`);
}

export function urlConnexionClient(suite: string): string {
  return `${PAGE_CONNEXION_CLIENT}?suite=${encodeURIComponent(suite)}`;
}

/** Où aller après la connexion ou un lien du mail : seulement une page du compte, sinon le compte. */
export function suiteClientSure(suite: string | null | undefined): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//') || suite.includes('\\')) return ESPACE_CLIENT;
  return estProtegeClient(suite.split(/[?#]/)[0]!) ? suite : ESPACE_CLIENT;
}
