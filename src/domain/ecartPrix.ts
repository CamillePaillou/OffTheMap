/**
 * Écart entre le prix proposé (copie du catalogue sur la ligne) et le prix revérifié par l'agent (E8.4).
 * Calculé par le code, jamais par le modèle (contrat de l'agent, « Réponse attendue »).
 */
export type SensEcart = 'hausse' | 'baisse' | 'identique';

export interface EcartPrix {
  unitaire_cents: number; // revérifié - proposé, signé
  total_cents: number; // sur la ligne : écart unitaire × participants × nuits
  pourcentage: number | null; // arrondi à 0,1 ; null si le prix proposé vaut 0
  sens: SensEcart;
}

/** null quand il n'y a rien à comparer : vérification en échec, donc ni prix ni places. */
export function ecartPrix(
  ligne: { prix_unitaire_catalogue_cents: number; participants: number; nb_nuits: number },
  verification: { prix_unitaire_cents: number | null },
): EcartPrix | null {
  if (verification.prix_unitaire_cents === null) return null;
  const propose = ligne.prix_unitaire_catalogue_cents;
  const unitaire = verification.prix_unitaire_cents - propose;
  return {
    unitaire_cents: unitaire,
    total_cents: unitaire * ligne.participants * ligne.nb_nuits,
    pourcentage: propose === 0 ? null : Math.round((unitaire / propose) * 1000) / 10,
    sens: unitaire > 0 ? 'hausse' : unitaire < 0 ? 'baisse' : 'identique',
  };
}

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 4000 → « 40,00 € » ; avec signe : 500 → « +5,00 € ». */
export function euros(cents: number, signe = false): string {
  const texte = EUROS.format(cents / 100);
  return signe && cents > 0 ? `+${texte}` : texte;
}
