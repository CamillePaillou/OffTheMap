/**
 * Corriger la fiche après l'entretien (E2.1) : budget réel, destination, dates fixes, notes. Si la saisie est invalide,
 * rien n'est écrit et chaque erreur est rattachée à son champ. Les champs de l'IA ne sont jamais modifiés ici,
 * et une régénération ne modifie jamais ceux-ci (fonctions SQL corriger_fiche et enregistrer_generation_fiche).
 */
import { SaisieCorrectionFiche, versCorrectionFiche } from '../../types/fiche';
import type { FichesRepository } from '../ports/dossiers';

export type ErreursChamps = Partial<Record<string, string>>;

export type ResultatCorrection = { ok: true } | { ok: false; erreurs: ErreursChamps };

export async function corrigerFiche(repo: FichesRepository, dossierId: string, saisie: unknown): Promise<ResultatCorrection> {
  const verdict = SaisieCorrectionFiche.safeParse(saisie);
  if (!verdict.success) {
    const erreurs: ErreursChamps = {};
    for (const issue of verdict.error.issues) {
      const champ = String(issue.path[0] ?? 'formulaire');
      erreurs[champ] ??= issue.message;
    }
    return { ok: false, erreurs };
  }
  const resultat = await repo.corriger(dossierId, versCorrectionFiche(verdict.data));
  if (resultat === 'sans_fiche') return { ok: false, erreurs: { formulaire: 'La fiche n’a pas encore été générée.' } };
  return { ok: true };
}
