/**
 * Répondre à un changement demandé par le client sans perdre la version envoyée (E6.1).
 *
 * La version envoyée n'est jamais modifiée : elle passe en changement_demande puis remplacee, ses lignes, son programme,
 * son total et sa date d'envoi restent tels quels. La version suivante (numéro suivant) reprend son programme et ses
 * lignes au prix ACTUEL du catalogue, sans prix confirmé : tout repart « à vérifier », le total et les alertes sont
 * recalculés par le code (E4.2). Le conseiller ajuste ensuite la nouvelle version (tarifs, E5.1) avant de la renvoyer.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { REGLES_CHIFFRAGE } from '../../types/chiffrage';
import { chiffrer, ErreurChiffrage } from '../domain/chiffrage/chiffrer';
import { verifierTransition } from '../domain/transition';
import type { LigneBrouillon } from '../ports/generationBrouillon';
import { VersionModifieeErreur, type VersionsRepository } from '../ports/versions';

export const MotifChangement = z.string().trim().min(1, 'Décrivez le changement demandé par le client').max(1000, '1000 caractères maximum');

export type ResultatChangement =
  | { ok: true; versionSuivanteId: string }
  | { ok: false; raison: 'motif_invalide'; message: string }
  | { ok: false; raison: 'introuvable' | 'transition_interdite' | 'statut_modifie' | 'chiffrage_impossible' };

const HORS_TOTAL: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal;

export async function demanderChangement(
  repo: VersionsRepository,
  demande: { propositionId: string; conseillerId: string; motif: unknown },
): Promise<ResultatChangement> {
  const motif = MotifChangement.safeParse(demande.motif);
  if (!motif.success) return { ok: false, raison: 'motif_invalide', message: motif.error.issues[0]!.message };

  const envoyee = await repo.lireVersionEnvoyee(demande.propositionId);
  if (!envoyee) return { ok: false, raison: 'introuvable' };
  // la matrice fait foi : envoyee → changement_demande (conseiller), puis changement_demande → remplacee (système)
  const auteur = { type: 'conseiller' as const, id: demande.conseillerId };
  if (!verifierTransition('proposition', envoyee.statut, 'changement_demande', auteur).ok
    || !verifierTransition('proposition', 'changement_demande', 'remplacee', { type: 'systeme' }).ok) {
    return { ok: false, raison: 'transition_interdite' };
  }

  // lignes retenues dans la version envoyée (ni remplacées ni indisponibles), au prix actuel du catalogue
  const reprises = envoyee.lignes.filter((l) => !HORS_TOTAL.includes(l.statut));
  const lignes: LigneBrouillon[] = reprises.map((l) => ({
    id: randomUUID(),
    prestation_id: l.prestation_id,
    date: l.date,
    participants: l.participants,
    prix_unitaire_catalogue_cents: l.prestation.prix_unitaire_cents,
  }));

  let chiffrage;
  try {
    chiffrage = chiffrer({
      ...envoyee.reference,
      lignes: lignes.map((l, i) => {
        const p = reprises[i]!.prestation;
        return { ...l, type: p.type, capacite: p.capacite, actif: p.actif, prix_confirme_cents: null, statut: 'a_verifier' as const };
      }),
    });
  } catch (e) {
    if (e instanceof ErreurChiffrage) return { ok: false, raison: 'chiffrage_impossible' };
    throw e;
  }

  try {
    const versionSuivanteId = await repo.creerVersionSuivante(demande.propositionId, demande.conseillerId, motif.data, {
      programme: envoyee.programme ?? [],
      lignes,
      total_cents: chiffrage.total_cents,
      alertes: chiffrage.alertes,
    });
    return { ok: true, versionSuivanteId };
  } catch (e) {
    if (e instanceof VersionModifieeErreur) return { ok: false, raison: 'statut_modifie' };
    throw e;
  }
}
