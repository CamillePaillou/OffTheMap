/**
 * Obtenir un brouillon de proposition (E4.4). Le modèle propose un programme sans montant et des lignes
 * (prestation, date, participants) parmi les prestations que le code a laissées passer ; le code copie les prix
 * du catalogue et calcule total et alertes (E4.2, chiffrer). Les lignes sont créées au statut a_verifier.
 *
 * - demanderBrouillon : clic du conseiller. Valide la fiche si besoin (entretien_fait → en_proposition) et crée la
 *   proposition en brouillon_en_cours. La génération suit en arrière-plan (lib/proposition/generation.ts).
 * - genererBrouillon : la proposition est en brouillon_en_cours. Le modèle ne reçoit que DemandePourLLM (ni nom,
 *   ni e-mail), la fiche validée sans les notes du conseiller, et l'id, le nom et le type des prestations : aucun prix.
 *   Un échec donne lieu à un seul nouvel essai ; s'il échoue encore, la proposition passe en erreur.
 * - relancerBrouillon : bouton « relancer » d'une proposition en erreur (erreur → brouillon_en_cours).
 */
import { randomUUID } from 'node:crypto';
import { versDemandePourLLM } from '../../types/llm';
import type { BrouillonIA, FicheIA } from '../../types/ia';
import { destinationDuDossier, prestationsAutorisees } from '../domain/brouillon/prestationsAutorisees';
import { chiffrer, ErreurChiffrage, nuitsDesHebergements, valeursDeReference } from '../domain/chiffrage/chiffrer';
import { DemarrageRefuse, type GenerationBrouillonRepository, type LigneBrouillon, type RefusDemarrage, type ResultatBrouillon } from '../ports/generationBrouillon';
import { LlmError, type CodeErreurLlm, type LlmClient } from '../ports/llm-client';
import { StatutModifieErreur, type StatutsRepository } from '../ports/statuts';
import { changerStatut, type ResultatTransition } from './changerStatut';

export const ESSAIS_MAX = 2; // un essai et un seul nouvel essai

export interface DependancesBrouillon {
  brouillons: GenerationBrouillonRepository;
  llm: LlmClient;
}

/** Libellés gardés en base : jamais le message brut, qui pourrait citer la réponse du modèle. */
const LIBELLES: Record<CodeErreurLlm | 'catalogue' | 'destination' | 'chiffrage' | 'inattendue', string> = {
  delai: 'le modèle n’a pas répondu à temps',
  erreur_fournisseur: 'le fournisseur du modèle est indisponible',
  reponse_invalide: 'la réponse du modèle n’était pas conforme',
  configuration: 'le modèle n’est pas configuré',
  catalogue: 'aucune prestation du catalogue ne correspond à la destination et au groupe',
  destination: 'aucune destination : la fixer sur la fiche du dossier',
  chiffrage: 'le brouillon n’a pas pu être chiffré',
  inattendue: 'erreur inattendue pendant la génération',
};

export type ResultatDemande = { ok: true; propositionId: string } | { ok: false; raison: RefusDemarrage };

export async function demanderBrouillon(brouillons: GenerationBrouillonRepository, dossierId: string, conseillerId: string): Promise<ResultatDemande> {
  try {
    return { ok: true, propositionId: await brouillons.demarrer(dossierId, conseillerId) };
  } catch (e) {
    if (e instanceof DemarrageRefuse) return { ok: false, raison: e.raison };
    throw e;
  }
}

export type ResultatGenerationBrouillon =
  | { ok: true; statut: 'a_verifier'; essais: number }
  | { ok: false; statut: 'erreur'; essais: number; erreur: string }
  | { ok: false; raison: 'introuvable' | 'statut_modifie' };

export async function genererBrouillon(d: DependancesBrouillon, propositionId: string): Promise<ResultatGenerationBrouillon> {
  const contexte = await d.brouillons.lireContexte(propositionId);
  if (!contexte) return { ok: false, raison: 'introuvable' };
  const { demande, fiche, catalogue } = contexte;

  const reference = valeursDeReference(demande, fiche); // la fiche corrigée l'emporte sur la demande
  const participants = demande.voyageurs.length;
  // destination fixée à l'entretien, sinon demandée ; sans elle, tout le catalogue se mélangerait (demarrer_brouillon refuse déjà)
  const destination = destinationDuDossier(demande, fiche);
  const autorisees = destination === null ? [] : prestationsAutorisees(catalogue, destination, participants);

  let essais = 0;
  let resultat: ResultatBrouillon;
  if (destination === null) {
    resultat = { erreur: LIBELLES.destination };
  } else if (autorisees.length === 0) {
    resultat = { erreur: LIBELLES.catalogue };
  } else {
    const entree = {
      // seule porte vers le modèle : ni nom ni e-mail ; dates et budget de référence
      demande: versDemandePourLLM({ ...demande, destination, date_debut: reference.date_debut, date_fin: reference.date_fin, nb_nuits: reference.nb_nuits, budget_annonce_cents: reference.budget_reference_cents }),
      fiche: versFicheIA(fiche),
      prestationsAutorisees: autorisees.map((p) => ({ id: p.id, nom: p.nom, type: p.type })),
      participants,
    };
    let brouillon = null;
    let derniere: unknown = null;
    while (essais < ESSAIS_MAX && brouillon === null) {
      essais += 1;
      try {
        brouillon = await d.llm.genererBrouillon(entree); // validé par schemaBrouillon dans l'adaptateur
      } catch (e) {
        derniere = e;
        if (e instanceof LlmError && e.code === 'configuration') break; // un nouvel essai ne changerait rien
      }
    }
    resultat = brouillon === null ? { erreur: LIBELLES[derniere instanceof LlmError ? derniere.code : 'inattendue'] } : chiffrerBrouillon(brouillon, autorisees, reference, participants);
  }

  try {
    const statut = await d.brouillons.terminer(propositionId, resultat);
    return 'erreur' in resultat || statut === 'erreur'
      ? { ok: false, statut: 'erreur', essais, erreur: 'erreur' in resultat ? resultat.erreur : LIBELLES.inattendue }
      : { ok: true, statut: 'a_verifier', essais };
  } catch (e) {
    if (e instanceof StatutModifieErreur) return { ok: false, raison: 'statut_modifie' };
    throw e;
  }
}

export function relancerBrouillon(statuts: StatutsRepository, propositionId: string, conseillerId: string): Promise<ResultatTransition<'proposition'>> {
  return changerStatut(statuts, { cible: 'proposition', id: propositionId, vers: 'brouillon_en_cours', auteur: { type: 'conseiller', id: conseillerId } });
}

// ------------------------------------------------------------------ interne

/** Prix copiés du catalogue, total et alertes calculés par le code. Une ligne invalide fait échouer le brouillon, sans écriture partielle. */
function chiffrerBrouillon(
  brouillon: BrouillonIA,
  autorisees: ReturnType<typeof prestationsAutorisees>,
  reference: ReturnType<typeof valeursDeReference>,
  participants: number,
): ResultatBrouillon {
  const parId = new Map(autorisees.map((p) => [p.id, p]));
  // une ligne d'hôtel couvre ses nuits jusqu'au prochain hôtel ou au départ : le modèle n'en propose souvent qu'une
  const nuits = nuitsDesHebergements(brouillon.lignes.map((l) => ({ type: parId.get(l.prestation_id)!.type, date: l.date })), reference.date_fin);
  const lignes: LigneBrouillon[] = brouillon.lignes.map((l, i) => ({
    id: randomUUID(),
    prestation_id: l.prestation_id,
    date: l.date,
    participants: l.participants,
    nb_nuits: nuits[i]!,
    prix_unitaire_catalogue_cents: parId.get(l.prestation_id)!.prix_unitaire_cents, // id garanti par schemaBrouillon
  }));
  try {
    const c = chiffrer({
      voyageurs: participants,
      ...reference,
      lignes: lignes.map((l) => {
        const p = parId.get(l.prestation_id)!;
        return { ...l, type: p.type, capacite: p.capacite, actif: p.actif, prix_confirme_cents: null, statut: 'a_verifier' as const };
      }),
    });
    return { programme: brouillon.programme, lignes, total_cents: c.total_cents, alertes: c.alertes };
  } catch (e) {
    if (e instanceof ErreurChiffrage) return { erreur: LIBELLES.chiffrage };
    throw e;
  }
}

/** La fiche telle que le modèle la voit : sans budget, dates fixes ni notes du conseiller. */
function versFicheIA(f: FicheIA): FicheIA {
  return { envies: f.envies, contraintes: f.contraintes, regimes: f.regimes, mobilite: f.mobilite, niveau_physique: f.niveau_physique, points_flous: f.points_flous };
}
