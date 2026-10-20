/**
 * Dépôt des accords en mémoire, pour les tests et l'écran sans base (même contrat que le futur adaptateur
 * PostgreSQL : accord et événement `accord` écrits ensemble, une seule démarche en cours par ligne).
 */
import { DemarcheEnCoursErreur, type AccordsRepository, type NouvelAccord, type ResultatPoseOption, type TentativeOption } from '../../ports/accords';

export interface AccordEnMemoire extends NouvelAccord {
  option_id: string;
  statut: 'accord_donne' | 'posee' | 'echec';
  option_id_simulateur?: string;
  expire_option_le?: string;
  reponse_serveur?: unknown;
  erreur_option?: string;
  accord_utilise: boolean;
}

export interface EvenementAccordEnMemoire {
  dossier_id: string;
  proposition_id: string;
  type: 'accord' | 'option';
  auteur_id: string;
  detail: Record<string, unknown>;
}

export class AccordsEnMemoire implements AccordsRepository {
  readonly accords: AccordEnMemoire[] = [];
  readonly historique: EvenementAccordEnMemoire[] = [];

  /** Un accord expiré ne bloque plus la ligne (en base : transition système accord_donne → echec). */
  async demarcheEnCours(ligneId: string, maintenant: Date): Promise<boolean> {
    return this.accordValable(ligneId, maintenant) !== undefined;
  }

  async enregistrerAccord(a: NouvelAccord): Promise<{ option_id: string }> {
    if (await this.demarcheEnCours(a.ligne_id, new Date(a.accord_le))) throw new DemarcheEnCoursErreur(a.ligne_id);
    const option_id = `opt-${this.accords.length + 1}`;
    this.accords.push({ ...a, option_id, statut: 'accord_donne', accord_utilise: false });
    this.historique.push({
      dossier_id: a.dossier_id,
      proposition_id: a.proposition_id,
      type: 'accord',
      auteur_id: a.accord_par,
      detail: { type: 'accord', option_id, ligne_id: a.ligne_id, prix_accorde_cents: a.prix_accorde_cents },
    });
    return { option_id };
  }


  /** Consommation avant l'appel réseau : en cas de délai ambigu, le même accord ne peut pas rejouer l'écriture. */
  async consommerAccord(optionId: string, maintenant: Date) {
    const accord = this.accords.find((a) => a.option_id === optionId);
    if (!accord || accord.statut !== 'accord_donne' || accord.accord_utilise || new Date(accord.accord_expire_le).getTime() <= maintenant.getTime()) return null;
    accord.accord_utilise = true;
    return accord;
  }

  async terminerPoseOption(optionId: string, resultat: ResultatPoseOption) {
    const accord = this.accords.find((a) => a.option_id === optionId);
    if (!accord) throw new Error(`Accord introuvable : ${optionId}`);
    if (resultat.ok) {
      accord.statut = 'posee';
      accord.option_id_simulateur = resultat.option_id_simulateur;
      accord.expire_option_le = resultat.expire_le;
      accord.reponse_serveur = resultat.reponse_serveur;
    } else {
      accord.statut = 'echec';
      accord.erreur_option = resultat.raison;
      accord.reponse_serveur = resultat.reponse_serveur;
    }
    this.historique.push({
      dossier_id: accord.dossier_id, proposition_id: accord.proposition_id, type: 'option', auteur_id: 'systeme',
      detail: { type: 'option', option_id: optionId, ligne_id: accord.ligne_id, ...resultat },
    });
  }

  async tracerTentativeOption(e: TentativeOption) {
    this.historique.push({
      dossier_id: e.dossier_id, proposition_id: e.proposition_id, type: 'option', auteur_id: e.auteur_id,
      detail: { type: 'tentative_refusee', ligne_id: e.ligne_id, raison: e.raison, date: e.date },
    });
  }

  /** Accord de la ligne encore valable (non expiré), pour l'affichage. */
  accordValable(ligneId: string, maintenant: Date): AccordEnMemoire | undefined {
    return this.accords.find(
      (a) => a.ligne_id === ligneId && a.statut === 'accord_donne' && !a.accord_utilise && new Date(a.accord_expire_le).getTime() > maintenant.getTime(),
    );
  }
}
