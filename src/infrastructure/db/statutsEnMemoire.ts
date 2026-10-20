/**
 * Dépôt des statuts en mémoire, pour les tests et les écrans sans base.
 * Même contrat que la fonction SQL changer_statut : statut et historique écrits ensemble, ou rien.
 */
import type { Cible, StatutDe } from '../../domain/transition';
import { StatutModifieErreur, type EcritureTransition, type StatutsRepository } from '../../ports/statuts';

export interface LigneHistoriqueEnMemoire {
  id: string;
  dossier_id: string;
  proposition_id: string | null;
  type: 'statut';
  ancien_statut: string;
  nouveau_statut: string;
  auteur: 'conseiller' | 'systeme';
  auteur_id: string | null;
  detail: unknown;
}

export class StatutsEnMemoire implements StatutsRepository {
  readonly dossiers = new Map<string, { statut: string }>();
  readonly propositions = new Map<string, { statut: string; dossier_id: string }>();
  readonly historique: LigneHistoriqueEnMemoire[] = [];

  async lireStatut<C extends Cible>(cible: C, id: string) {
    const ligne = cible === 'dossier' ? this.dossiers.get(id) : this.propositions.get(id);
    return (ligne?.statut ?? null) as StatutDe<C> | null;
  }

  async appliquerTransition<C extends Cible>(e: EcritureTransition<C>): Promise<string> {
    const proposition = e.cible === 'proposition' ? this.propositions.get(e.id) : undefined;
    const ligne = e.cible === 'dossier' ? this.dossiers.get(e.id) : proposition;
    if (!ligne) throw new Error(`${e.cible} introuvable : ${e.id}`);
    if (ligne.statut !== e.ancien) throw new StatutModifieErreur(e.ancien, ligne.statut);

    const id = String(this.historique.length + 1);
    this.historique.push({
      id,
      dossier_id: proposition?.dossier_id ?? e.id,
      proposition_id: proposition ? e.id : null,
      type: 'statut',
      ancien_statut: e.ancien,
      nouveau_statut: e.nouveau,
      auteur: e.auteur.type,
      auteur_id: e.auteur.type === 'conseiller' ? e.auteur.id : null,
      detail: e.detail,
    });
    ligne.statut = e.nouveau;
    return id;
  }
}
