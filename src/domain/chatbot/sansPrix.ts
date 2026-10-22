/**
 * Aucun prix dans les réponses du chatbot (E1.3). Les prix sont vérifiés par un conseiller puis envoyés dans la
 * proposition : le chatbot n'en annonce jamais, même « à partir de ». Les outils ne transmettent déjà aucun prix au
 * modèle ; ce filtre retire en plus tout montant qu'il écrirait quand même (prix appris ailleurs, invention).
 */

export const PRIX_RETIRE = '(prix communiqué par un conseiller)';

// 179 €, 179,50 €, € 179, 179 euros, 179 EUR, à partir de 148 € / pers.
const MONTANT =
  /(?:(?:à\s+partir\s+de|dès|environ|autour\s+de)\s+)?(?:€\s?\d[\d\s.,]*|\d[\d\s.,]*\s?(?:€|euros?\b|eur\b))(?:\s?(?:\/|par)\s?(?:pers(?:onne)?\.?|nuit|adulte))?/giu;

export function sansPrix(texte: string): string {
  return texte.replace(MONTANT, PRIX_RETIRE).replace(/(\(prix communiqué par un conseiller\)\s*){2,}/g, `${PRIX_RETIRE} `);
}

export function contientPrix(texte: string): boolean {
  MONTANT.lastIndex = 0;
  const trouve = MONTANT.test(texte);
  MONTANT.lastIndex = 0;
  return trouve;
}
