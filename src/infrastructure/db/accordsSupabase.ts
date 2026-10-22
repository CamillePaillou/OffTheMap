import 'server-only';
import { z } from 'zod';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import {
  DemarcheEnCoursErreur,
  type AccordOption,
  type AccordOptionEtOption,
  type AccordsRepository,
  type NouvelAccord,
  type ResultatAnnulation,
  type ResultatConfirmation,
  type ResultatPoseOption,
  type TentativeConfirmation,
  type TentativeOption,
} from '../../ports/accords';

const SELECT_OPTION = `id, ligne_id, statut, accord_par, accord_le, accord_expire_le, prix_accorde_cents, accord_utilise,
  option_id_simulateur, expire_le, reservation_id_simulateur, confirme_le, reponse_confirmation, proposition_lignes (proposition_id, prestation_id, date, participants, propositions (dossier_id))`;

interface OptionBase {
  id: string; ligne_id: string; statut: string; accord_par: string; accord_le: string; accord_expire_le: string;
  prix_accorde_cents: number; accord_utilise: boolean; option_id_simulateur: string | null; expire_le: string | null;
  reservation_id_simulateur: string | null; confirme_le: string | null; reponse_confirmation: unknown;
  proposition_lignes: { proposition_id: string; prestation_id: string; date: string; participants: number; propositions: { dossier_id: string } };
}

const iso = (t: string) => new Date(t).toISOString();
const uuidOuNull = (id: string) => (z.uuid().safeParse(id).success ? id : null); // « systeme » : pas de conseiller

function versAccord(o: OptionBase): AccordOptionEtOption {
  const l = o.proposition_lignes;
  return {
    option_id: o.id,
    dossier_id: l.propositions.dossier_id,
    proposition_id: l.proposition_id,
    ligne_id: o.ligne_id,
    accord_par: o.accord_par,
    accord_le: iso(o.accord_le),
    accord_expire_le: iso(o.accord_expire_le),
    prix_accorde_cents: o.prix_accorde_cents,
    accord_utilise: o.accord_utilise,
    statut: o.statut as AccordOption['statut'],
    option_id_simulateur: o.option_id_simulateur ?? undefined,
    expire_option_le: o.expire_le ? iso(o.expire_le) : undefined,
    reservation_id_simulateur: o.reservation_id_simulateur ?? undefined,
    confirme_le: o.confirme_le ? iso(o.confirme_le) : undefined,
    reponse_confirmation: o.reponse_confirmation ?? undefined,
    ligne_snapshot: { prestation_id: l.prestation_id, date: l.date, participants: l.participants },
  };
}

/**
 * Accords, options, réservations et annulations (E9.3 à E9.5 et E9.8, branchés en base par E7.4) : écritures par les fonctions SQL
 * de 20261022090000_accord_option_reservation.sql, avec la clé service_role, après exigerConseiller().
 */
export class AccordsSupabase implements AccordsRepository {
  async demarcheEnCours(ligneId: string, maintenant: Date) {
    return (await this.accordValable(ligneId, maintenant)) !== undefined || (await this.optionActive(ligneId, maintenant)) !== undefined;
  }

  async enregistrerAccord(a: NouvelAccord) {
    const { data, error } = await clientService().rpc('enregistrer_accord', {
      p_ligne: a.ligne_id,
      p_conseiller: a.accord_par,
      p_accord_le: a.accord_le,
      p_expire_le: a.accord_expire_le,
      p_prix_cents: a.prix_accorde_cents,
    });
    if (error?.code === 'OT012') throw new DemarcheEnCoursErreur(a.ligne_id);
    if (error) throw new Error(`enregistrer_accord : ${error.message}`);
    return { option_id: data };
  }

  async accordValable(ligneId: string, maintenant: Date) {
    const { data, error } = await clientService()
      .from('options')
      .select(SELECT_OPTION)
      .eq('ligne_id', ligneId)
      .eq('statut', 'accord_donne')
      .eq('accord_utilise', false)
      .gt('accord_expire_le', maintenant.toISOString())
      .maybeSingle();
    if (error) throw new Error(`accord de la ligne : ${error.message}`);
    return data ? versAccord(data as OptionBase) : undefined;
  }

  async consommerAccord(optionId: string, maintenant: Date) {
    const { data, error } = await clientService().rpc('consommer_accord', { p_option: optionId, p_maintenant: maintenant.toISOString() });
    if (error) throw new Error(`consommer_accord : ${error.message}`);
    if (!data) return null;
    const lu = await clientService().from('options').select(SELECT_OPTION).eq('id', optionId).single();
    if (lu.error) throw new Error(`accord consommé : ${lu.error.message}`);
    return versAccord(lu.data as OptionBase);
  }

  async terminerPoseOption(optionId: string, r: ResultatPoseOption) {
    const { error } = await clientService().rpc('terminer_pose_option', {
      p_option: optionId,
      p_ok: r.ok,
      p_option_id_simulateur: r.ok ? r.option_id_simulateur : null,
      p_expire_le: r.ok ? r.expire_le : null,
      p_reponse: (r.reponse_serveur ?? null) as Json,
      p_raison: r.ok ? null : r.raison,
    });
    if (error) throw new Error(`terminer_pose_option : ${error.message}`);
  }

  async tracerTentativeOption(e: TentativeOption) {
    await this.tracer(uuidOuNull(e.proposition_id), e.ligne_id, e.auteur_id, { type: 'tentative_refusee', ligne_id: e.ligne_id, raison: e.raison, date: e.date });
  }

  /** Option posée ou confirmée de la ligne (la plus récente), même expirée : confirmerReservation le vérifie. */
  async optionPosee(ligneId: string) {
    const { data, error } = await clientService()
      .from('options')
      .select(SELECT_OPTION)
      .eq('ligne_id', ligneId)
      .in('statut', ['posee', 'confirmee'])
      .order('cree_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`option de la ligne : ${error.message}`);
    return data ? versAccord(data as OptionBase) : undefined;
  }

  async terminerConfirmation(optionId: string, r: ResultatConfirmation) {
    const { error } = await clientService().rpc('terminer_confirmation', {
      p_option: optionId,
      p_ok: r.ok,
      p_conseiller: r.ok ? r.confirme_par : null,
      p_reservation_id_simulateur: r.ok ? r.reservation_id_simulateur : null,
      p_reponse: (r.reponse_serveur ?? null) as Json,
      p_raison: r.ok ? null : r.raison,
    });
    if (error) throw new Error(`terminer_confirmation : ${error.message}`);
  }

  async tracerTentativeConfirmation(e: TentativeConfirmation) {
    await this.tracer(null, e.ligne_id, e.auteur_id, {
      type: 'tentative_confirmation', ligne_id: e.ligne_id, raison: e.raison, date: e.date, ...(e.detail !== undefined ? { detail: e.detail } : {}),
    });
  }

  async reservationConfirmee(ligneId: string) {
    return this.derniere(ligneId, 'confirmee');
  }

  /** Dernière réservation annulée de la ligne, pour l'affichage. */
  async reservationAnnulee(ligneId: string) {
    return this.derniere(ligneId, 'annulee');
  }

  async terminerAnnulation(optionId: string, auteurId: string, r: ResultatAnnulation) {
    const { error } = await clientService().rpc('terminer_annulation', {
      p_option: optionId,
      p_ok: r.ok,
      p_conseiller: uuidOuNull(auteurId),
      p_reponse: (r.reponse_serveur ?? null) as Json,
      p_raison: r.ok ? null : r.raison,
    });
    if (error) throw new Error(`terminer_annulation : ${error.message}`);
  }

  async tracerTentativeAnnulation(e: TentativeConfirmation) {
    await this.tracer(null, e.ligne_id, e.auteur_id, {
      type: 'tentative_annulation', ligne_id: e.ligne_id, raison: e.raison, date: e.date, ...(e.detail !== undefined ? { detail: e.detail } : {}),
    });
  }

  /**
   * Échec de pose, si c'est la dernière démarche de la ligne (pour l'affichage) : raison et date, lues dans le journal.
   * Un accord simplement expiré n'y figure pas : il n'a jamais été envoyé au prestataire.
   */
  async dernierEchecPose(ligneId: string): Promise<{ raison: string; le: string } | undefined> {
    const derniere = await clientService()
      .from('options')
      .select('id, statut')
      .eq('ligne_id', ligneId)
      .order('cree_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (derniere.error) throw new Error(`dernière démarche de la ligne : ${derniere.error.message}`);
    if (derniere.data?.statut !== 'echec') return undefined;
    const { data, error } = await clientService()
      .from('historique_dossier')
      .select('detail, cree_le')
      .eq('type', 'option')
      .eq('detail->>type', 'option')
      .eq('detail->>option_id', derniere.data.id)
      .maybeSingle();
    if (error) throw new Error(`échec de pose : ${error.message}`);
    const raison = (data?.detail as { raison?: unknown } | null)?.raison;
    return data && typeof raison === 'string' ? { raison, le: iso(data.cree_le) } : undefined;
  }

  private async derniere(ligneId: string, statut: 'confirmee' | 'annulee') {
    const { data, error } = await clientService()
      .from('options')
      .select(SELECT_OPTION)
      .eq('ligne_id', ligneId)
      .eq('statut', statut)
      .order('cree_le', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`option ${statut} de la ligne : ${error.message}`);
    return data ? versAccord(data as OptionBase) : undefined;
  }

  private async optionActive(ligneId: string, maintenant: Date) {
    const { data, error } = await clientService()
      .from('options')
      .select('id')
      .eq('ligne_id', ligneId)
      .eq('statut', 'posee')
      .gt('expire_le', maintenant.toISOString())
      .maybeSingle();
    if (error) throw new Error(`option active de la ligne : ${error.message}`);
    return data ?? undefined;
  }

  private async tracer(propositionId: string | null, ligneId: string, auteurId: string, detail: Record<string, unknown>) {
    const { error } = await clientService().rpc('tracer_evenement_option', {
      p_proposition: propositionId,
      p_ligne: uuidOuNull(ligneId),
      p_conseiller: uuidOuNull(auteurId),
      p_detail: detail as Json,
    });
    if (error) throw new Error(`tracer_evenement_option : ${error.message}`);
  }
}
