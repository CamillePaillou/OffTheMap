/**
 * E9.8 (Could) : annuler une réservation confirmée par erreur, pour libérer les places.
 * Écriture chez le prestataire : exige l'identité du conseiller, la clé d'approbation saisie par lui
 * et une confirmation explicite (case cochée). La clé n'est jamais journalisée ni stockée ; l'agent n'y a pas accès.
 * La réponse du simulateur est vérifiée avant d'être enregistrée, et chaque refus est tracé.
 */
import { nuitsDeLaDemarche, type AccordsRepository } from '../ports/accords';
import type { Prestataires, ReservationConfirmee } from '../ports/prestataires';

export interface DemandeAnnulation {
  conseiller: { id: string; nom: string };
  ligneId: string;
  cleApprobation: string;
  /** Deuxième geste, distinct de la saisie de la clé : le conseiller confirme qu'il veut bien annuler. */
  confirme: boolean;
  maintenant?: Date;
}

export type RaisonRefusAnnulation =
  | 'conseiller_non_identifie' | 'cle_absente' | 'confirmation_absente' | 'reservation_introuvable'
  | 'simulateur_delai' | 'simulateur_erreur' | 'simulateur_refus' | 'reponse_serveur_incoherente';

export type ResultatAnnulationReservation =
  | { ok: true; reservation_id: string; reponse_serveur: unknown }
  | { ok: false; raison: RaisonRefusAnnulation; reponse_serveur?: unknown };

export async function annulerReservation(repo: AccordsRepository, prestataires: Prestataires, d: DemandeAnnulation): Promise<ResultatAnnulationReservation> {
  const maintenant = d.maintenant ?? new Date();
  const auteur = d.conseiller.id.trim() || 'systeme';
  const refuser = async (raison: RaisonRefusAnnulation, reponse_serveur?: unknown): Promise<ResultatAnnulationReservation> => {
    await repo.tracerTentativeAnnulation({ ligne_id: d.ligneId, auteur_id: auteur, raison, date: maintenant.toISOString() });
    return { ok: false, raison, ...(reponse_serveur !== undefined ? { reponse_serveur } : {}) };
  };

  // Tous les contrôles se font avant la moindre écriture chez le prestataire.
  if (!d.conseiller.id.trim() || !d.conseiller.nom.trim()) return refuser('conseiller_non_identifie');
  if (!d.cleApprobation.trim()) return refuser('cle_absente');
  if (!d.confirme) return refuser('confirmation_absente');
  const reservation = await repo.reservationConfirmee(d.ligneId);
  if (!reservation?.reservation_id_simulateur || reservation.statut !== 'confirmee') return refuser('reservation_introuvable');

  // Un hébergement de N nuits a N réservations chez le simulateur : toutes sont annulées, dans l'ordre.
  const annulees: ReservationConfirmee[] = [];
  const reponseServeur = (derniere?: unknown) => {
    const toutes = derniere === undefined ? annulees : [...annulees, derniere];
    return toutes.length === 1 ? toutes[0] : toutes; // une nuit : la réponse telle quelle, comme avant
  };
  for (const nuit of nuitsDeLaDemarche(reservation)) {
    const resultat = await prestataires.annulerReservation({
      reservation_id: nuit.reservation_id ?? reservation.reservation_id_simulateur, cle_approbation: d.cleApprobation, approuve_par: d.conseiller.nom,
    });
    if (!resultat.ok) {
      // Délai ou erreur : on ne sait pas si l'annulation a eu lieu. La réservation reste « confirmée » chez nous
      // et la tentative est tracée (avec les nuits déjà annulées) ; le conseiller vérifie avant de réessayer.
      const raison = resultat.panne === 'refus' ? 'simulateur_refus' : resultat.panne === 'delai' ? 'simulateur_delai' : 'simulateur_erreur';
      await repo.terminerAnnulation(reservation.option_id, auteur, { ok: false, raison, reponse_serveur: reponseServeur(resultat) });
      return { ok: false, raison, reponse_serveur: reponseServeur(resultat) };
    }
    const reponse = resultat.valeur;
    if (reponse.reservation_id !== (nuit.reservation_id ?? reservation.reservation_id_simulateur) || reponse.statut !== 'annulee') {
      await repo.terminerAnnulation(reservation.option_id, auteur, { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: reponseServeur(reponse) });
      return { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: reponseServeur(reponse) };
    }
    annulees.push(reponse);
  }
  const premiere = annulees[0]!;
  await repo.terminerAnnulation(reservation.option_id, auteur, { ok: true, reservation_id_simulateur: premiere.reservation_id, reponse_serveur: reponseServeur() });
  return { ok: true, reservation_id: premiere.reservation_id, reponse_serveur: reponseServeur() };
}
