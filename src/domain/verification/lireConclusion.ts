/**
 * Lecture de la conclusion de l'agent (E8.3) : le modèle conclut en texte, par un objet JSON
 * conforme à `ConclusionVerification`. Le contrat n'expose qu'un outil, la conclusion n'en est donc pas un.
 * Les modèles gratuits entourent souvent le JSON de ```json … ``` ou d'une phrase : on prend
 * le premier objet JSON du texte, puis le schéma tranche.
 *
 * Règle pure, sans dépendance.
 */
import { ConclusionVerification } from '../../../types';

export type LectureConclusion =
  | { ok: true; conclusion: ConclusionVerification; brute: unknown }
  | { ok: false; raison: string; brute: unknown };

export function lireConclusion(texte: string | null): LectureConclusion {
  if (!texte?.trim()) return { ok: false, raison: 'ni appel d’outil ni conclusion', brute: null };

  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin < debut) return { ok: false, raison: 'conclusion sans objet JSON', brute: texte.slice(0, 1000) };

  let brute: unknown;
  try {
    brute = JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    return { ok: false, raison: 'conclusion JSON illisible', brute: texte.slice(0, 1000) };
  }
  const r = ConclusionVerification.safeParse(brute);
  if (!r.success) {
    return { ok: false, raison: `conclusion non conforme : ${r.error.issues.map((i) => `${i.path.join('.') || 'conclusion'} (${i.message})`).join(', ')}`.slice(0, 500), brute };
  }
  return { ok: true, conclusion: r.data, brute };
}
