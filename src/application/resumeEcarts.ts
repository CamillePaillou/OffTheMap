/**
 * Résumer les écarts en mots (E6.3) : sur une version qui répond à un changement du client, le conseiller obtient un
 * court paragraphe écrit par l'IA, sans aucun chiffre, à reprendre dans sa réponse au client. Il y ajoute les prix lui-même.
 *
 * - Les écarts sont calculés par le code (E6.2, comparerVersions), puis traduits en faits qualitatifs (versEntreeEcarts) :
 *   le modèle ne reçoit ni montant, ni date, ni nombre.
 * - Sa réponse est validée par EcartsIA : un chiffre ou un montant, même en lettres, la rend non conforme.
 * - Le résumé est enregistré avec l'empreinte des écarts pour lesquels il a été écrit : si les écarts changent ensuite
 *   (tarifs confirmés, ligne remplacée), l'écran signale qu'il n'est plus à jour.
 */
import { createHash } from 'node:crypto';
import { comparerVersions } from '../domain/proposition/ecartsVersions';
import { versEntreeEcarts, type EntreeEcarts } from '../domain/proposition/entreeEcarts';
import { LlmError, type CodeErreurLlm, type LlmClient } from '../ports/llm-client';
import type { PropositionsLecture, ResumeEcartsEcriture } from '../ports/propositions';

export const ESSAIS_MAX = 2; // un essai et un seul nouvel essai, comme la fiche et le brouillon

/** Empreinte stable des faits envoyés au modèle : deux écarts identiques en mots ont la même empreinte. */
export function empreinteEcarts(entree: EntreeEcarts): string {
  return createHash('sha256').update(JSON.stringify(entree)).digest('hex').slice(0, 16);
}

const LIBELLES: Record<CodeErreurLlm | 'inattendue', string> = {
  delai: 'Le modèle n’a pas répondu à temps. Réessayez dans un instant.',
  erreur_fournisseur: 'Le fournisseur du modèle est indisponible. Réessayez dans un instant.',
  reponse_invalide: 'Le résumé proposé contenait un chiffre ou un montant : il a été refusé. Réessayez.',
  configuration: 'Le modèle n’est pas configuré sur le serveur.',
  inattendue: 'Le résumé n’a pas pu être écrit.',
};

export type ResultatResume =
  | { ok: true; resume: string; essais: number }
  | { ok: false; raison: 'introuvable' | 'premiere_version' | 'aucun_ecart' }
  | { ok: false; raison: 'modele'; message: string; essais: number };

export async function resumerEcarts(
  d: { lecture: PropositionsLecture; ecriture: ResumeEcartsEcriture; llm: LlmClient },
  propositionId: string,
): Promise<ResultatResume> {
  const proposition = await d.lecture.proposition(propositionId);
  if (!proposition) return { ok: false, raison: 'introuvable' };
  const precedente = proposition.version > 1 ? await d.lecture.versionDuDossier(proposition.dossier_id, proposition.version - 1) : null;
  if (!precedente) return { ok: false, raison: 'premiere_version' };

  const ecarts = comparerVersions(precedente, proposition);
  if (ecarts.prestations.length === 0) return { ok: false, raison: 'aucun_ecart' };
  const entree = versEntreeEcarts(ecarts);

  let essais = 0;
  let derniere: unknown = null;
  while (essais < ESSAIS_MAX) {
    essais += 1;
    try {
      const { resume } = await d.llm.resumerEcarts(entree); // validé par EcartsIA dans l'adaptateur
      await d.ecriture.enregistrerResumeEcarts(propositionId, { resume, empreinte: empreinteEcarts(entree) });
      return { ok: true, resume, essais };
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      derniere = e;
      if (e.code === 'configuration') break; // un nouvel essai ne changerait rien
    }
  }
  return { ok: false, raison: 'modele', message: LIBELLES[derniere instanceof LlmError ? derniere.code : 'inattendue'], essais };
}
