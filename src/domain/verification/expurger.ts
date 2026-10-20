/**
 * Expurgation de la trace avant écriture dans verifications.trace (E8.5, critère 6 du contrat de l'agent).
 * Jamais dans une trace : X-Team-Key, clé OpenRouter, clé d'approbation.
 *
 * Trois filets, du plus sûr au plus large :
 * 1. les valeurs exactes des secrets connus du programme (passées par l'appelant, lues dans l'environnement) ;
 * 2. toute valeur rangée sous un nom de champ sensible (clé, jeton, en-tête d'autorisation…) ;
 * 3. les motifs qui ressemblent à une clé (sk-…, Bearer …, X-Team-Key: …).
 * Le résultat est ensuite validé par `TraceVerification` : un champ inconnu est refusé, pas recopié.
 *
 * Les données du client ne sont pas filtrées ici : elles n'entrent jamais dans la boucle (l'entrée de
 * l'agent est construite par le code à partir de la ligne). Les masquer fausserait la trace, qui sert de preuve.
 */
import { TraceVerification } from '../../../types';

export const EXPURGE = '[expurgé]';

const CHAMP_SENSIBLE = /(^|[-_])(key|cle|clef|token|jeton|secret|password|mot[-_]?de[-_]?passe|authorization|cookie)($|[-_])|api[-_]?key/i;
/** camelCase : teamKey, accessToken… */
const CHAMP_SENSIBLE_CAMEL = /[a-z](Key|Token|Secret|Password)$/;
const estChampSensible = (cle: string) => CHAMP_SENSIBLE.test(cle) || CHAMP_SENSIBLE_CAMEL.test(cle);

const MOTIFS_SENSIBLES: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g, // clés de type OpenRouter / OpenAI (sk-or-v1-…)
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\b(x-team-key|x-approval-key)\s*[:=]\s*\S+/gi,
];

/** Valeur trop courte pour être cherchée sans tout masquer (ex. « 1 »). */
const LONGUEUR_MIN_SECRET = 6;

function expurgerTexte(texte: string, secrets: readonly string[]): string {
  let t = texte;
  for (const s of secrets) t = t.split(s).join(EXPURGE);
  for (const m of MOTIFS_SENSIBLES) t = t.replace(m, EXPURGE);
  return t;
}

function expurgerValeur(valeur: unknown, secrets: readonly string[]): unknown {
  if (typeof valeur === 'string') return expurgerTexte(valeur, secrets);
  if (Array.isArray(valeur)) return valeur.map((v) => expurgerValeur(v, secrets));
  if (valeur !== null && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([cle, v]) => [
      cle,
      estChampSensible(cle) ? EXPURGE : expurgerValeur(v, secrets),
    ]));
  }
  return valeur;
}

/**
 * Rend une trace sûre à enregistrer. Lève une erreur zod si la trace ne respecte pas le contrat.
 * @param secrets valeurs exactes des clés du programme (équipe, OpenRouter, approbation).
 */
export function expurgerTrace(trace: unknown, secrets: readonly (string | undefined)[] = []): TraceVerification {
  const connus = secrets
    .filter((s): s is string => typeof s === 'string' && s.trim().length >= LONGUEUR_MIN_SECRET)
    .sort((a, b) => b.length - a.length); // la plus longue d'abord si l'une contient l'autre
  return TraceVerification.parse(expurgerValeur(trace, connus));
}

/** Vrai si un secret connu ou un motif de clé apparaît encore quelque part (oracle des tests et d'E11). */
export function contientSecret(valeur: unknown, secrets: readonly (string | undefined)[] = []): boolean {
  const texte = JSON.stringify(valeur) ?? '';
  if (secrets.some((s) => typeof s === 'string' && s.trim().length >= LONGUEUR_MIN_SECRET && texte.includes(s))) return true;
  return MOTIFS_SENSIBLES.some((m) => new RegExp(m.source, m.flags.replace('g', '')).test(texte));
}
