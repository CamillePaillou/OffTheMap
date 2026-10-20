/**
 * Dépôt des accords en mémoire, pour les tests et l'écran sans base (même contrat que le futur adaptateur
 * PostgreSQL : accord et événement `accord` écrits ensemble, une seule démarche en cours par ligne).
 */
import { DemarcheEnCoursErreur, type AccordsRepository, type NouvelAccord } from '../../ports/accords';

export interface AccordEnMemoire extends NouvelAccord {
  option_id: string;
  statut: 'accord_donne';
  accord_utilise: boolean;
}

export interface EvenementAccordEnMemoire {
  dossier_id: string;
  proposition_id: string;
  type: 'accord';
  auteur_id: string;
  detail: { type: 'accord'; option_id: string; ligne_id: string; prix_accorde_cents: number };
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

  /** Accord de la ligne encore valable (non expiré), pour l'affichage. */
  accordValable(ligneId: string, maintenant: Date): AccordEnMemoire | undefined {
    return this.accords.find(
      (a) => a.ligne_id === ligneId && !a.accord_utilise && new Date(a.accord_expire_le).getTime() > maintenant.getTime(),
    );
  }
}
