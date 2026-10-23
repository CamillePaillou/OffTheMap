/**
 * E9.4 : pose une option uniquement après consommation d'un accord humain valide.
 * Le simulateur ne pose qu'une date à la fois : un hébergement de N nuits demande N options, posées l'une après
 * l'autre ; la première qui échoue arrête la pose. Les options déjà posées pour les nuits précédentes ne peuvent pas
 * être retirées (le simulateur n'a pas d'annulation d'option) : elles expirent d'elles-mêmes, et la réponse les garde.
 */
import type { Proposition } from '../../types/dashboard';
import { basePrixAccord, datesDeLaLigne } from '../domain/accord';
import { formaterMontant } from '../domain/chiffrage/chiffrer';
import type { OptionPosee, Prestataires } from '../ports/prestataires';
import type { AccordsRepository, NuitSimulateur } from '../ports/accords';

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
  // même prix de référence que l'accord : vérification de l'agent, ou tarif saisi plus récent
  const base = basePrixAccord(ligne);
  const prixNuit = base === null ? null : base.prix_unitaire_cents * ligne.participants;
  if (prixNuit === null || candidat.prix_accorde_cents !== prixNuit * ligne.nb_nuits) {
    return refuser('accord_incoherent');
  }

  const consomme = await repo.consommerAccord(candidat.option_id, maintenant);
  if (!consomme) return refuser('accord_absent_ou_expire');

  // une option par nuit, dans l'ordre ; chacune au prix d'une nuit, la somme fait le prix accordé
  const posees: OptionPosee[] = [];
  const reponseServeur = (derniere?: unknown) => {
    const toutes = derniere === undefined ? posees : [...posees, derniere];
    return toutes.length === 1 ? toutes[0] : toutes; // une nuit : la réponse telle quelle, comme avant
  };
  for (const date of datesDeLaLigne(ligne)) {
    const reponse = await prestataires.poserOption({ prestation_id: ligne.prestation.id, date, participants: ligne.participants });
    if (!reponse.ok) {
      const raison = reponse.panne === 'refus' ? 'simulateur_refus' : reponse.panne === 'delai' ? 'simulateur_delai' : 'simulateur_erreur';
      await repo.terminerPoseOption(candidat.option_id, { ok: false, raison, reponse_serveur: reponseServeur(reponse) });
      return { ok: false, raison, detail: reponse.panne === 'refus' ? `${reponse.message}${ligne.nb_nuits > 1 ? ` (nuit du ${date})` : ''}` : undefined };
    }
    const option = reponse.valeur;
    const conforme = option.prestation_id === ligne.prestation.id && option.date === date &&
      option.participants === ligne.participants && option.prix_total_cents === consomme.prix_accorde_cents / ligne.nb_nuits &&
      option.statut === 'active' && Number.isFinite(Date.parse(option.expire_le)) && Date.parse(option.expire_le) > maintenant.getTime();
    if (!conforme) {
      await repo.terminerPoseOption(candidat.option_id, { ok: false, raison: 'reponse_serveur_incoherente', reponse_serveur: reponseServeur(option) });
      // un prix différent : on dit lequel, pour corriger le tarif saisi (ou revérifier) en connaissance de cause
      const attendu = consomme.prix_accorde_cents / ligne.nb_nuits;
      const detail = option.prix_total_cents !== attendu && option.participants > 0
        ? `Le prestataire annonce ${formaterMontant(option.prix_total_cents / option.participants)} par personne${ligne.nb_nuits > 1 ? ' et par nuit' : ''}, `
          + `${base!.source === 'agent' ? 'prix vérifié' : 'tarif saisi'} : ${formaterMontant(base!.prix_unitaire_cents)}.`
        : undefined;
      return { ok: false, raison: 'reponse_serveur_incoherente', ...(detail ? { detail } : {}) };
    }
    posees.push(option);
  }

  // la démarche expire avec sa première option : au-delà, une nuit ne serait plus tenue
  const expire_le = posees.map((o) => o.expire_le).sort((a, b) => Date.parse(a) - Date.parse(b))[0]!;
  const nuits: NuitSimulateur[] = posees.map((o) => ({ date: o.date, option_id: o.option_id, prix_total_cents: o.prix_total_cents }));
  const premiere = posees[0]!;
  await repo.terminerPoseOption(candidat.option_id, {
    ok: true, option_id_simulateur: premiere.option_id, expire_le, reponse_serveur: reponseServeur(), nuits,
    ligne_snapshot: { prestation_id: ligne.prestation.id, date: ligne.date, participants: ligne.participants, nb_nuits: ligne.nb_nuits },
  });
  return { ok: true, option_id: premiere.option_id, prix_total_cents: consomme.prix_accorde_cents, expire_le, reponse_serveur: reponseServeur() };
}
