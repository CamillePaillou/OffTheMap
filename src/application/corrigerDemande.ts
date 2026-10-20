/**
 * Corriger ma demande depuis un lien (E1.2). Spécification : docs/specs/correction-demande.md.
 *
 * - demanderCorrection : le conseiller choisit les points à revoir, écrit un motif et, s'il veut, un petit
 *   commentaire par point (affiché sous le champ) ; un jeton aléatoire est créé,
 *   seule son empreinte SHA-256 part en base. Le jeton en clair n'existe que dans le lien envoyé au client.
 * - lireCorrection : la page publique lit l'état du lien et la version à préremplir.
 * - corrigerDemande : le renvoi crée la version suivante et repasse le dossier en fiche_en_cours.
 *   Un point signalé renvoyé tel quel déclenche une alerte : le client doit confirmer qu'il est exact.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  FORMAT_JETON,
  REGLES_CORRECTION,
  pointsInchanges,
  schemaDemandeCorrection,
  type ChampCorrigeable,
} from '../../types/correction';
import {
  BouclesEpuiseesErreur,
  DossierPasACorrigerErreur,
  LienInvalideErreur,
  type CorrectionsRepository,
  type EtatLien,
  type LectureCorrection,
} from '../ports/corrections';
import { validerSaisie, type ErreursChamps } from './deposerDemande';

export function creerJeton(): string {
  return randomBytes(32).toString('base64url');
}

export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

export type ResultatDemandeCorrection =
  | { ok: true; jeton: string; boucle: number; expireLe: string }
  | { ok: false; erreurs: ErreursChamps }
  | { ok: false; refus: 'pas_a_corriger' | 'boucles_epuisees' };

export async function demanderCorrection(
  repo: CorrectionsRepository,
  entree: { dossierId: string; conseillerId: string; champs: unknown; motif: unknown; commentaires?: unknown },
  maintenant: Date = new Date(),
): Promise<ResultatDemandeCorrection> {
  const verdict = schemaDemandeCorrection.safeParse({ champs: entree.champs, motif: entree.motif, commentaires: entree.commentaires });
  if (!verdict.success) {
    const erreurs: ErreursChamps = {};
    for (const issue of verdict.error.issues) erreurs[String(issue.path[0] ?? 'formulaire')] ??= issue.message;
    return { ok: false, erreurs };
  }
  const jeton = creerJeton();
  const expireLe = new Date(maintenant.getTime() + REGLES_CORRECTION.dureeLienJours * 86_400_000).toISOString();
  try {
    const { boucle } = await repo.demander({
      dossierId: entree.dossierId,
      conseillerId: entree.conseillerId,
      champs: verdict.data.champs,
      motif: verdict.data.motif,
      commentaires: verdict.data.commentaires,
      jetonHash: empreinteJeton(jeton),
      expireLe,
    });
    return { ok: true, jeton, boucle, expireLe };
  } catch (e) {
    if (e instanceof DossierPasACorrigerErreur) return { ok: false, refus: 'pas_a_corriger' };
    if (e instanceof BouclesEpuiseesErreur) return { ok: false, refus: 'boucles_epuisees' };
    throw e;
  }
}

/** Chemin du lien envoyé au client (à préfixer par l'adresse publique du site). */
export const cheminCorrection = (jeton: string) => `/demande/corriger/${jeton}`;

export async function lireCorrection(repo: CorrectionsRepository, jeton: string): Promise<LectureCorrection> {
  // un jeton mal formé ne va pas jusqu'à la base
  if (!FORMAT_JETON.test(jeton)) return { etat: 'inconnu' };
  return repo.lire(empreinteJeton(jeton));
}

export type ResultatCorrection =
  | { ok: true; version: number; dossierId: string }
  | { ok: false; erreurs: ErreursChamps }
  | { ok: false; inchanges: ChampCorrigeable[] }
  | { ok: false; lien: Exclude<EtatLien, 'valide'> };

export async function corrigerDemande(
  repo: CorrectionsRepository,
  jeton: string,
  saisie: unknown,
  aujourdhui: string,
  options: { confirmeInchanges: boolean },
): Promise<ResultatCorrection> {
  const lecture = await lireCorrection(repo, jeton);
  if (lecture.etat !== 'valide') return { ok: false, lien: lecture.etat };

  const v = validerSaisie(saisie, aujourdhui);
  if (!v.ok) return v;

  const inchanges = pointsInchanges(lecture.demande, v.demande, lecture.champs);
  if (inchanges.length > 0 && !options.confirmeInchanges) return { ok: false, inchanges };

  try {
    const { version, dossierId } = await repo.corriger(empreinteJeton(jeton), v.demande);
    return { ok: true, version, dossierId }; // dossierId : pour relancer la fiche (E2.2)
  } catch (e) {
    // utilisé ou clos entre la lecture et l'écriture (double envoi, conseiller qui a trié entre-temps)
    if (e instanceof LienInvalideErreur) return { ok: false, lien: 'clos' };
    throw e;
  }
}
