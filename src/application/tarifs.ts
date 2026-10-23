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
 * - Sur une version modifiable, le conseiller ajoute une prestation, ou change la date ou les participants d'une ligne,
 *   pour refléter le changement demandé par le client (E6.6).
 */
import { z } from 'zod';
import { ALERTES_BLOQUANTES, LIMITES, REGLES_CHIFFRAGE, type SourcePrix, type StatutLigne, type StatutProposition } from '../../types';
import { TRANSITIONS_LIGNE, trouverTransition } from '../../types/transitions';
import { chiffrer, formaterMontant, type EntreeChiffrage } from '../domain/chiffrage/chiffrer';
import { StatutModifieErreur } from '../ports/statuts';
import {
  AccordClientRequisErreur,
  DemarcheEnCoursLigneErreur,
  DerniereLigneErreur,
  EnvoiRefuseErreur,
  LigneModifieeErreur,
  MemePrestationErreur,
  NuitsRefuseesErreur,
  PrestationRefuseeErreur,
  PropositionFigeeErreur,
  SejourImpossibleErreur,
  type Sejour,
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
  | 'prestation_refusee' | 'meme_prestation' | /** E6.6 : déjà prévue à cette date, ou rien ne change. */ 'deja_prevue'
  | /** E7.4, après le dépôt : */ 'accord_client_requis' | 'derniere_ligne' | 'demarche_en_cours'
  | /** plusieurs nuits pour une prestation qui n'est pas un hébergement */ 'nuits_refusees';
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
    if (e instanceof DemarcheEnCoursLigneErreur) return { ok: false, raison: 'demarche_en_cours' };
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
  entree: { ligneId: string; conseillerId: string; prestationId: unknown; date?: unknown; /** E7.4 : exigé après le dépôt. */ accordClient?: boolean },
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
      accordClient: entree.accordClient === true,
    });
  } catch (e) {
    if (e instanceof LigneModifieeErreur) return { ok: false, raison: 'ligne_modifiee' };
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof PrestationRefuseeErreur) return { ok: false, raison: 'prestation_refusee' };
    if (e instanceof MemePrestationErreur) return { ok: false, raison: 'meme_prestation' };
    if (e instanceof AccordClientRequisErreur) return { ok: false, raison: 'accord_client_requis' };
    throw e;
  }
  await recalculerAlertes(repo, ligne.propositionId);
  return { ok: true, statutProposition: r.statutProposition, nouvelleLigneId: r.ligneId };
}

/**
 * Retire une ligne indisponible sans la remplacer (E7.4) : après le dépôt seulement, avec l'accord du client.
 * La ligne passe à « retiree », hors total ; la proposition reste au dépôt reçu, ou devient réservée si tout le reste l'est.
 */
export async function retirerLigne(
  repo: TarifsRepository,
  entree: { ligneId: string; conseillerId: string; accordClient: boolean },
): Promise<ResultatLigne> {
  const ligne = await repo.lireLigne(entree.ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };
  if (!entree.conseillerId.trim() || !trouverTransition(TRANSITIONS_LIGNE, ligne.statut, 'retiree', 'conseiller')) {
    return { ok: false, raison: 'transition_interdite' };
  }
  if (!entree.accordClient) return { ok: false, raison: 'accord_client_requis' };
  let statutProposition: StatutProposition;
  try {
    statutProposition = await repo.retirerLigne({ ligneId: entree.ligneId, conseillerId: entree.conseillerId, accordClient: true });
  } catch (e) {
    if (e instanceof LigneModifieeErreur) return { ok: false, raison: 'ligne_modifiee' };
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof AccordClientRequisErreur) return { ok: false, raison: 'accord_client_requis' };
    if (e instanceof DerniereLigneErreur) return { ok: false, raison: 'derniere_ligne' };
    throw e;
  }
  await recalculerAlertes(repo, ligne.propositionId);
  return { ok: true, statutProposition };
}

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date');
const participants = z.coerce.number('Nombre de participants invalide').int('Nombre de participants invalide')
  .min(1, 'Au moins un participant').max(LIMITES.participantsMax, `${LIMITES.participantsMax} participants au plus`);

const nuits = z.coerce.number('Nombre de nuits invalide').int('Nombre de nuits invalide')
  .min(1, 'Au moins une nuit').max(REGLES_CHIFFRAGE.nuitsMaxParLigne, `${REGLES_CHIFFRAGE.nuitsMaxParLigne} nuits au plus`);

export const schemaAjout = z.object({
  prestationId: z.string().regex(/^[a-z0-9-]+$/, 'Choisissez une prestation du catalogue'),
  date,
  participants,
  /** Hébergement : nuits depuis la date ; vide = 1. */
  nbNuits: z.union([z.literal(''), nuits]).optional().transform((n) => (n === '' || n === undefined ? 1 : n)),
});

/** Vide : inchangé. Au moins un champ doit changer. */
export const schemaModification = z.object({
  date: z.union([z.literal(''), date]).transform((d) => d || undefined),
  participants: z.union([z.literal(''), participants]).transform((n) => (n === '' ? undefined : n)),
  nbNuits: z.union([z.literal(''), nuits]).optional().transform((n) => (n === '' ? undefined : n)),
}).refine((m) => m.date !== undefined || m.participants !== undefined || m.nbNuits !== undefined, {
  message: 'Changez la date, le nombre de participants ou de nuits', path: ['formulaire'],
});

const erreursDe = (issues: readonly z.core.$ZodIssue[]): ErreursChamps => {
  const erreurs: ErreursChamps = {};
  for (const i of issues) erreurs[String(i.path[0] ?? 'formulaire')] ??= i.message;
  return erreurs;
};

/**
 * Ajoute une prestation du catalogue à une proposition modifiable (E6.6), par exemple une nuit d'hôtel pour « deux nuits
 * au lieu d'une » : la ligne naît « à vérifier » au prix du catalogue. Les autres lignes et leurs tarifs restent intacts ;
 * le total et le statut de la proposition sont recalculés par la base, les alertes par le code.
 */
export async function ajouterLigne(
  repo: TarifsRepository,
  entree: { propositionId: string; conseillerId: string; prestationId: unknown; date: unknown; participants: unknown; nbNuits?: unknown },
): Promise<ResultatLigne> {
  const saisie = schemaAjout.safeParse({ prestationId: entree.prestationId, date: entree.date, participants: entree.participants, nbNuits: entree.nbNuits });
  if (!saisie.success) return { ok: false, erreurs: erreursDe(saisie.error.issues) };
  if (!entree.conseillerId.trim() || !trouverTransition(TRANSITIONS_LIGNE, null, 'a_verifier', 'conseiller')) {
    return { ok: false, raison: 'transition_interdite' };
  }
  let r;
  try {
    r = await repo.ajouterLigne({ propositionId: entree.propositionId, conseillerId: entree.conseillerId, ...saisie.data });
  } catch (e) {
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof PrestationRefuseeErreur) return { ok: false, raison: 'prestation_refusee' };
    if (e instanceof MemePrestationErreur) return { ok: false, raison: 'deja_prevue' };
    if (e instanceof NuitsRefuseesErreur) return { ok: false, raison: 'nuits_refusees' };
    throw e;
  }
  await recalculerAlertes(repo, entree.propositionId);
  return { ok: true, statutProposition: r.statutProposition, nouvelleLigneId: r.ligneId };
}

/**
 * Change la date, les participants et/ou les nuits d'une ligne (E6.6) : elle repasse « à vérifier », sans prix confirmé,
 * car le tarif obtenu ne vaut plus pour une autre date, un autre groupe ou d'autres nuits. Les autres lignes restent intactes.
 */
export async function modifierLigne(
  repo: TarifsRepository,
  entree: { ligneId: string; conseillerId: string; date: unknown; participants: unknown; nbNuits?: unknown },
): Promise<ResultatLigne> {
  const saisie = schemaModification.safeParse({ date: entree.date ?? '', participants: entree.participants ?? '', nbNuits: entree.nbNuits ?? '' });
  if (!saisie.success) return { ok: false, erreurs: erreursDe(saisie.error.issues) };
  const ligne = await repo.lireLigne(entree.ligneId);
  if (!ligne) return { ok: false, raison: 'introuvable' };
  // une ligne à vérifier le reste ; confirmée ou indisponible, elle repasse à vérifier (transitions de la matrice)
  if (!entree.conseillerId.trim()
    || (ligne.statut !== 'a_verifier' && !trouverTransition(TRANSITIONS_LIGNE, ligne.statut, 'a_verifier', 'conseiller'))) {
    return { ok: false, raison: 'transition_interdite' };
  }
  let statutProposition: StatutProposition;
  try {
    statutProposition = await repo.modifierLigne({
      ligneId: entree.ligneId, conseillerId: entree.conseillerId,
      ...(saisie.data.date ? { date: saisie.data.date } : {}),
      ...(saisie.data.participants ? { participants: saisie.data.participants } : {}),
      ...(saisie.data.nbNuits ? { nbNuits: saisie.data.nbNuits } : {}),
    });
  } catch (e) {
    if (e instanceof LigneModifieeErreur) return { ok: false, raison: 'ligne_modifiee' };
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof MemePrestationErreur) return { ok: false, raison: 'deja_prevue' };
    if (e instanceof NuitsRefuseesErreur) return { ok: false, raison: 'nuits_refusees' };
    throw e;
  }
  await recalculerAlertes(repo, ligne.propositionId);
  return { ok: true, statutProposition };
}

export type ResultatSejour = { ok: true; sejour: Sejour } | { ok: false; raison: 'proposition_figee' | 'sejour_impossible' | 'transition_interdite' };

/**
 * Boutons « − » et « + » du séjour (E6.6) : une nuit de moins ou de plus, la date de retour suit. Écrit dans les dates
 * fixes de la fiche (ce que le conseiller a convenu avec le client), puis le code recalcule les alertes : une nuit
 * d'hôtel ajoutée cesse d'être « hors du séjour ». Les lignes ne bougent pas : on les ajuste à part.
 */
export async function ajusterSejour(
  repo: TarifsRepository,
  entree: { propositionId: string; conseillerId: string; delta: number },
): Promise<ResultatSejour> {
  if (!entree.conseillerId.trim() || (entree.delta !== 1 && entree.delta !== -1)) return { ok: false, raison: 'transition_interdite' };
  let sejour: Sejour;
  try {
    sejour = await repo.ajusterNuitsSejour(entree.propositionId, entree.delta, entree.conseillerId);
  } catch (e) {
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    if (e instanceof SejourImpossibleErreur) return { ok: false, raison: 'sejour_impossible' };
    throw e;
  }
  await recalculerAlertes(repo, entree.propositionId);
  return { ok: true, sejour };
}

/** Budget global du groupe en euros entiers, comme dans la fiche (E2.1). */
export const schemaBudget = z.object({
  budget: z.coerce.number('Budget en euros entiers').int('Budget en euros entiers').positive('Le budget doit être positif').max(1_000_000),
});

export type ResultatBudget = { ok: true } | { ok: false; erreurs: ErreursChamps } | { ok: false; raison: 'proposition_figee' | 'transition_interdite' };

/**
 * « Modifier » le budget sur la page de la proposition (E6.6) : le client accepte de payer plus (ou moins). Écrit le
 * budget réel de la fiche, puis le code recalcule les alertes de budget. Jamais automatique : c'est une information du
 * client, que seul le conseiller change.
 */
export async function modifierBudget(
  repo: TarifsRepository,
  entree: { propositionId: string; conseillerId: string; budget: unknown },
): Promise<ResultatBudget> {
  const brut = typeof entree.budget === 'string' ? entree.budget.trim() : entree.budget;
  if (brut === '' || brut === null || brut === undefined) return { ok: false, erreurs: { budget: 'Indiquez un budget' } }; // vide : pas 0 €
  const saisie = schemaBudget.safeParse({ budget: brut });
  if (!saisie.success) return { ok: false, erreurs: { budget: saisie.error.issues[0]!.message } };
  if (!entree.conseillerId.trim()) return { ok: false, raison: 'transition_interdite' };
  try {
    await repo.modifierBudgetReel(entree.propositionId, saisie.data.budget * 100, entree.conseillerId);
  } catch (e) {
    if (e instanceof PropositionFigeeErreur) return { ok: false, raison: 'proposition_figee' };
    throw e;
  }
  await recalculerAlertes(repo, entree.propositionId);
  return { ok: true };
}

/** Chiffrage (E4.2) et ce qui bloque l'envoi, sans rien écrire : pour l'affichage. */
export function etatEnvoi(entree: EntreeChiffrage & { destination: string | null }) {
  const chiffrage = chiffrer(entree);
  const raisons = bloquants(entree.lignes.map((l) => l.statut), chiffrage);
  if (!entree.destination) raisons.unshift('aucune destination : fixez-la sur la fiche du dossier');
  return { chiffrage, bloquants: raisons };
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
