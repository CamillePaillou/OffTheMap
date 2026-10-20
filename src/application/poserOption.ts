/** E9.4 : pose une option uniquement après consommation d'un accord humain valide. */
import type { Proposition } from '../../types/dashboard';
import type { Prestataires } from '../ports/prestataires';
import type { AccordsRepository } from '../ports/accords';

export interface DemandePoserOption {
  conseiller: { id: string; nom?: string };
  proposition: Proposition;
  ligneId: string;
  maintenant?: Date;
}

export type ResultatPoseOption =
  | { ok: true; option_id: string; prix_total_cents: number; expire_le: string; reponse_serveur: unknown }
  | { ok: false; raison: 'conseiller_non_identifie' | 'ligne_introuvable' | 'accord_absent_ou_expire' | 'accord_incoherent' | 'simulateur_delai' | 'simulateur_erreur' | 'simulateur_refus' | 'reponse_serveur_incoherente'; detail?: string };

export async function poserOption(repo: AccordsRepository, prestataires: Prestataires, d: DemandePoserOption): Promise<ResultatPoseOption> {
  const maintenant = d.maintenant ?? new Date();
  const ligne = d.proposition.lignes.find((l) => l.id === d.ligneId);
  const refuser = async (raison: Exclude<ResultatPoseOption, { ok: true }>['raison']): Promise<ResultatPoseOption> => {
    await repo.tracerTentativeOption({
      dossier_id: d.proposition.dossier_id, proposition_id: d.proposition.id, ligne_id: d.ligneId,
      auteur_id: d.conseiller.id.trim() || 'systeme', raison, date: maintenant.toISOString(),
    });
    return { ok: false, raison };
  };

  if (!d.conseiller.id.trim()) return refuser('conseiller_non_identifie');
  if (!ligne) return refuser('ligne_introuvable');
  if (d.proposition.statut !== 'depot_recu' || ligne.statut !== 'confirme' || !ligne.prestation.actif) return refuser('accord_incoherent');

  const candidat = await repo.accordValable(ligne.id, maintenant);
  if (!candidat) return refuser('accord_absent_ou_expire');
  const prixUnitaire = ligne.derniere_verification?.prix_unitaire_cents;
  if (prixUnitaire === null || prixUnitaire === undefined || candidat.prix_accorde_cents !== prixUnitaire * ligne.participants) {
    return refuser('accord_incoherent');
  }

  const consomme = await repo.consommerAccord(candidat.option_id, maintenant);
  if (!consomme) return refuser('accord_absent_ou_expire');

  const reponse = await prestataires.poserOption({ prestation_id: ligne.prestation.id, date: ligne.date, participants: ligne.participants });
  if (!reponse.ok) {
    const raison = reponse.panne === 'refus' ? 'simulateur_refus' : reponse.panne === 'delai' ? 'simulateur_delai' : 'simulateur_erreur';
    await repo.terminerPoseOption(candidat.option_id, { ok: false, raison, reponse_serveur: reponse });
    return { ok: false, raison, detail: reponse.panne === 'refus' ? reponse.message : undefined };
  }

  const option = reponse.valeur;
  const conforme = option.prestation_id === ligne.prestation.id && option.date === ligne.date &&
    option.participants === ligne.participants && option.prix_total_cents === consomme.prix_accorde_cents &&
    option.statut === 'active' && Number.isFinite(Date.parse(option.expire_le)) && Date.parse(option.expire_le) > maintenant.getTime();
  if (!conforme) {
    await repo.terminerPoseOption(candidat.option_id, { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: option });
    return { ok: false, raison: 'reponse_serveur_incoherente' };
  }

  await repo.terminerPoseOption(candidat.option_id, {
    ok: true, option_id_simulateur: option.option_id, expire_le: option.expire_le, reponse_serveur: option,
  });
  return { ok: true, option_id: option.option_id, prix_total_cents: option.prix_total_cents, expire_le: option.expire_le, reponse_serveur: option };
}
