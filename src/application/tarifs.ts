/**
 * Confirmer les tarifs et n'envoyer que des prix vérifiés (E5.1). Spécification : docs/specs/envoi-proposition.md.
 *
 * - Ligne par ligne, le conseiller accepte le prix revérifié par l'agent (source « agent »), ou saisit le tarif
 *   obtenu autrement (téléphone, mail, lien du prestataire). La date et l'auteur sont posés par la base.
 *   Il peut aussi marquer une ligne indisponible, ou la repasser à vérifier avant l'envoi.
 * - Après chaque changement, la base recalcule le total et le statut de la proposition ; le code recalcule les
 *   alertes (chiffrer, E4.2).
 * - L'envoi n'est possible que si aucune ligne n'est à vérifier ni indisponible et aucune alerte n'est bloquante :
 *   sinon il est refusé et le statut ne change pas.
 * - Une ligne indisponible se remplace par une autre prestation du catalogue, sans toucher aux autres lignes (E5.2).
 */
import { z } from 'zod';
import { ALERTES_BLOQUANTES, type SourcePrix, type StatutLigne, type StatutProposition } from '../../types';
import { TRANSITIONS_LIGNE, trouverTransition } from '../../types/transitions';
import { chiffrer, formaterMontant, type EntreeChiffrage } from '../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../ports/statuts';
import {
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  MemePrestationErreur,
  PrestationRefuseeErreur,
  PropositionFigeeErreur,
  type TarifsRepository,
} from '../ports/tarifs';
import type { ErreursChamps } from './deposerDemande';

/** Sources d'un tarif saisi à la main : « agent » est réservé au prix revérifié accepté tel quel. */
export const SOURCES_SAISIES = ['telephone', 'mail', 'lien'] as const satisfies readonly SourcePrix[];

/** Montant en euros, virgule ou point, deux décimales au plus : converti en centimes entiers sans flottant. */
const montantEnCentimes = z
  .string()
  .trim()
  .regex(/^\d{1,6}(?:[.,]\d{1,2})?$/, 'Montant en euros, par exemple 35 ou 35,50')
  .transform((s) => {
    const [euros, decimales = ''] = s.replace(',', '.').split('.');
    return Number(euros) * 100 + Number(decimales.padEnd(2, '0'));
  });

export const schemaTarif = z.object({
  montant: montantEnCentimes,
  source: z.enum(SOURCES_SAISIES, 'Indiquez d’où vient ce tarif'),
});

export type RefusLigne =
  | 'introuvable' | 'transition_interdite' | 'ligne_modifiee' | 'proposition_figee' | 'pas_de_prix_verifie'
  | 'prestation_refusee' | 'meme_prestation';
export type ResultatLigne =
  | { ok: true; statutProposition: StatutProposition; /** E5.2 : la ligne créée par le remplacement. */ nouvelleLigneId?: string }
  | { ok: false; erreurs: ErreursChamps }
  | { ok: false; raison: RefusLigne };

async function changer(
  repo: TarifsRepository,
  ligneId: string,
  conseillerId: string,
  nouveau: StatutLigne,
  prix: { cents: number; source: SourcePrix } | null,
): Promise<ResultatLigne> {
  const ligne = await repo.lireLigne(ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };
  if (!conseillerId.trim() || !trouverTransition(TRANSITIONS_LIGNE, ligne.statut, nouveau, 'conseiller')) {
    return { ok: false, raison: 'transition_interdite' };
  }
  let statutProposition: StatutProposition;
  try {
    statutProposition = await repo.changerLigne({
      ligneId, ancien: ligne.statut, nouveau, prixCents: prix?.cents ?? null, source: prix?.source ?? null, conseillerId,
    });
  } catch (e) {
    if (e instanceof LigneModifieeErreur) return { ok: false, raison: 'ligne_modifiee' };
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    throw e;
  }
  await recalculerAlertes(repo, ligne.propositionId);
  return { ok: true, statutProposition };
}

/** Tarif obtenu par téléphone, mail ou sur le lien du prestataire. */
export async function confirmerTarif(
  repo: TarifsRepository,
  entree: { ligneId: string; conseillerId: string; montant: unknown; source: unknown },
): Promise<ResultatLigne> {
  const saisie = schemaTarif.safeParse({ montant: entree.montant, source: entree.source });
  if (!saisie.success) {
    const erreurs: ErreursChamps = {};
    for (const i of saisie.error.issues) erreurs[String(i.path[0] ?? 'formulaire')] ??= i.message;
    return { ok: false, erreurs };
  }
  return changer(repo, entree.ligneId, entree.conseillerId, 'confirme', { cents: saisie.data.montant, source: saisie.data.source });
}

/**
 * Accepte la conclusion de l'agent : son prix revérifié (source « agent »), ou l'indisponibilité qu'il a constatée.
 * Une vérification en échec ne donne aucun prix : il faut revérifier ou saisir un tarif.
 */
export async function accepterVerification(repo: TarifsRepository, entree: { ligneId: string; conseillerId: string }): Promise<ResultatLigne> {
  const ligne = await repo.lireLigne(entree.ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };
  const v = ligne.verification;
  if (v?.statut === 'indisponible') return changer(repo, entree.ligneId, entree.conseillerId, 'indisponible', null);
  if (v?.statut !== 'ok' || v.prix_unitaire_cents === null) return { ok: false, raison: 'pas_de_prix_verifie' };
  return changer(repo, entree.ligneId, entree.conseillerId, 'confirme', { cents: v.prix_unitaire_cents, source: 'agent' });
}

export function marquerIndisponible(repo: TarifsRepository, entree: { ligneId: string; conseillerId: string }) {
  return changer(repo, entree.ligneId, entree.conseillerId, 'indisponible', null);
}

/** Repasse une ligne confirmée ou indisponible à vérifier, avant l'envoi. */
export function revoirLigne(repo: TarifsRepository, entree: { ligneId: string; conseillerId: string }) {
  return changer(repo, entree.ligneId, entree.conseillerId, 'a_verifier', null);
}

export const schemaRemplacement = z.object({
  prestationId: z.string().regex(/^[a-z0-9-]+$/, 'Choisissez une prestation du catalogue'),
  /** Vide : la date de l'ancienne ligne est gardée. */
  date: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date au format AAAA-MM-JJ').transform((d) => d || undefined),
});

/**
 * Remplace une ligne indisponible par une prestation du catalogue, une autre ou la même à une autre date (E5.2) :
 * l'ancienne passe à « remplacee »,
 * la nouvelle naît « à vérifier » au prix du catalogue. Les autres lignes et leurs tarifs confirmés restent intacts.
 * Le total et le statut de la proposition sont recalculés par la base, les alertes par le code.
 */
export async function remplacerLigne(
  repo: TarifsRepository,
  entree: { ligneId: string; conseillerId: string; prestationId: unknown; date?: unknown },
): Promise<ResultatLigne> {
  const saisie = schemaRemplacement.safeParse({ prestationId: entree.prestationId, date: entree.date ?? '' });
  if (!saisie.success) {
    const erreurs: ErreursChamps = {};
    for (const i of saisie.error.issues) erreurs[String(i.path[0] ?? 'formulaire')] ??= i.message;
    return { ok: false, erreurs };
  }
  const ligne = await repo.lireLigne(entree.ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };
  if (!entree.conseillerId.trim() || !trouverTransition(TRANSITIONS_LIGNE, ligne.statut, 'remplacee', 'conseiller')) {
    return { ok: false, raison: 'transition_interdite' };
  }
  let r;
  try {
    r = await repo.remplacerLigne({
      ligneId: entree.ligneId, prestationId: saisie.data.prestationId, conseillerId: entree.conseillerId,
      ...(saisie.data.date ? { date: saisie.data.date } : {}),
    });
  } catch (e) {
    if (e instanceof LigneModifieeErreur) return { ok: false, raison: 'ligne_modifiee' };
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof PrestationRefuseeErreur) return { ok: false, raison: 'prestation_refusee' };
    if (e instanceof MemePrestationErreur) return { ok: false, raison: 'meme_prestation' };
    throw e;
  }
  await recalculerAlertes(repo, ligne.propositionId);
  return { ok: true, statutProposition: r.statutProposition, nouvelleLigneId: r.ligneId };
}

/** Chiffrage (E4.2) et ce qui bloque l'envoi, sans rien écrire : pour l'affichage. */
export function etatEnvoi(entree: EntreeChiffrage) {
  const chiffrage = chiffrer(entree);
  return { chiffrage, bloquants: bloquants(entree.lignes.map((l) => l.statut), chiffrage) };
}

/** Alertes recalculées depuis l'état en base et enregistrées ; renvoie aussi ce qui bloque l'envoi. */
export async function recalculerAlertes(repo: TarifsRepository, propositionId: string) {
  const entree = await repo.lireChiffrage(propositionId);
  if (!entree) return null;
  const etat = etatEnvoi(entree);
  await repo.enregistrerAlertes(propositionId, etat.chiffrage.alertes);
  return { entree, ...etat };
}

function bloquants(statuts: readonly StatutLigne[], r: ReturnType<typeof chiffrer>): string[] {
  const n = (s: StatutLigne) => statuts.filter((x) => x === s).length;
  const raisons: string[] = [];
  if (n('a_verifier')) raisons.push(`${n('a_verifier')} ligne${n('a_verifier') > 1 ? 's' : ''} à vérifier`);
  if (n('indisponible')) raisons.push(`${n('indisponible')} ligne${n('indisponible') > 1 ? 's' : ''} indisponible${n('indisponible') > 1 ? 's' : ''} : revérifiez ou remplacez la prestation`);
  for (const a of r.alertes) if (ALERTES_BLOQUANTES.includes(a.code)) raisons.push(a.message);
  return raisons;
}

export type ResultatEnvoi =
  | { ok: true; total: string }
  | { ok: false; raison: 'introuvable' | 'statut' | 'statut_modifie'; statut?: StatutProposition }
  | { ok: false; raison: 'bloque'; bloquants: string[] };

/** Envoi au client : refusé, sans rien changer, tant qu'un prix n'est pas vérifié ou qu'une alerte bloque. */
export async function envoyerProposition(repo: TarifsRepository, entree: { propositionId: string; conseillerId: string }): Promise<ResultatEnvoi> {
  const etat = await recalculerAlertes(repo, entree.propositionId);
  if (!etat) return { ok: false, raison: 'introuvable' };
  if (etat.bloquants.length > 0) return { ok: false, raison: 'bloque', bloquants: etat.bloquants };
  if (etat.entree.statut !== 'prete') return { ok: false, raison: 'statut', statut: etat.entree.statut };
  try {
    await repo.envoyer(entree.propositionId, entree.conseillerId);
  } catch (e) {
    if (e instanceof EnvoiRefuseErreur) return { ok: false, raison: 'bloque', bloquants: ['la base a refusé l’envoi : une ligne ou une alerte bloque'] };
    if (e instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    throw e;
  }
  return { ok: true, total: formaterMontant(etat.chiffrage.total_cents) };
}
