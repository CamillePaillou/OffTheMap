/** E9.5 : seconde validation humaine, distincte de l'accord ayant permis de poser l'option. */
import type { AccordsRepository } from '../ports/accords';
import type { Prestataires } from '../ports/prestataires';

export interface DemandeConfirmation {
  conseiller: { id: string; nom: string };
  ligneId: string;
  cleApprobation: string;
  maintenant?: Date;
}

export type ResultatConfirmation =
  | { ok: true; reservation_id: string; reponse_serveur: unknown }
  | { ok: false; raison: 'conseiller_non_identifie' | 'cle_absente' | 'option_introuvable' | 'option_expiree'; prix_unitaire_reverifie_cents?: number; reponse_serveur?: unknown }
  | { ok: false; raison: 'simulateur_delai' | 'simulateur_erreur' | 'simulateur_refus' | 'reponse_serveur_incoherente'; reponse_serveur?: unknown };

export async function confirmerReservation(repo: AccordsRepository, prestataires: Prestataires, d: DemandeConfirmation): Promise<ResultatConfirmation> {
  const maintenant = d.maintenant ?? new Date();
  const refuser = async (raison: Extract<ResultatConfirmation, { ok: false }>['raison'], extra: object = {}): Promise<ResultatConfirmation> => {
    await repo.tracerTentativeConfirmation({ ligne_id: d.ligneId, auteur_id: d.conseiller.id.trim() || 'systeme', raison, date: maintenant.toISOString() });
    return { ok: false, raison, ...extra } as ResultatConfirmation;
  };
  if (!d.conseiller.id.trim() || !d.conseiller.nom.trim()) return refuser('conseiller_non_identifie');
  if (!d.cleApprobation.trim()) return refuser('cle_absente');
  const option = await repo.optionPosee(d.ligneId);
  if (!option?.option_id_simulateur || !option.expire_option_le || option.statut !== 'posee') return refuser('option_introuvable');
  if (Date.parse(option.expire_option_le) <= maintenant.getTime()) {
    // L'option expirée ne peut jamais être confirmée. On relit le prix actuel et on le trace ;
    // le conseiller devra ensuite repasser par l'accord puis poser une nouvelle option.
    const ligne = option.ligne_snapshot;
    const verification = await prestataires.disponibilite({ prestation_id: ligne.prestation_id, date: ligne.date, participants: ligne.participants });
    if (!verification.ok) return refuser('option_expiree', { reponse_serveur: verification });
    await repo.tracerTentativeConfirmation({ ligne_id: d.ligneId, auteur_id: d.conseiller.id, raison: 'option_expiree_prix_reverifie', date: maintenant.toISOString(), detail: verification.valeur });
    return { ok: false, raison: 'option_expiree', prix_unitaire_reverifie_cents: verification.valeur.prix_unitaire_cents, reponse_serveur: verification.valeur };
  }
  const resultat = await prestataires.confirmerReservation({ option_id: option.option_id_simulateur, cle_approbation: d.cleApprobation, approuve_par: d.conseiller.nom });
  if (!resultat.ok) {
    const raison = resultat.panne === 'refus' ? 'simulateur_refus' : resultat.panne === 'delai' ? 'simulateur_delai' : 'simulateur_erreur';
    await repo.terminerConfirmation(option.option_id, { ok: false, raison, reponse_serveur: resultat });
    await repo.tracerTentativeConfirmation({ ligne_id: d.ligneId, auteur_id: d.conseiller.id, raison, date: maintenant.toISOString() });
    return { ok: false, raison, reponse_serveur: resultat };
  }
  const reservation = resultat.valeur;
  if (reservation.option_id !== option.option_id_simulateur || reservation.statut !== 'confirmee' || reservation.approuve_par !== d.conseiller.nom || reservation.prix_total_cents !== option.prix_accorde_cents) {
    await repo.terminerConfirmation(option.option_id, { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: reservation });
    return refuser('reponse_serveur_incoherente', { reponse_serveur: reservation });
  }
  await repo.terminerConfirmation(option.option_id, { ok: true, reservation_id_simulateur: reservation.reservation_id, reponse_serveur: reservation });
  return { ok: true, reservation_id: reservation.reservation_id, reponse_serveur: reservation };
}
