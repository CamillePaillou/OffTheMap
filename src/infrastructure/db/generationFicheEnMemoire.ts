/** Génération de fiche en mémoire, pour les tests. Même contrat que terminer_generation_fiche (E2.2). */
import type { DemandeLue } from '../../../types/llm';
import type { Generation, GenerationFicheRepository } from '../../ports/generationFiche';
import { StatutModifieErreur } from '../../ports/statuts';
import type { StatutsEnMemoire } from './statutsEnMemoire';

export class GenerationFicheEnMemoire implements GenerationFicheRepository {
  readonly demandes = new Map<string, DemandeLue>();
  /** Une fiche par dossier (une seule version de demande ici) : comme unique (demande_id) en base. */
  readonly fiches = new Map<string, { modele: string; generation: Generation }>();

  constructor(private readonly statuts: StatutsEnMemoire) {}

  async lireDemandeCourante(dossierId: string) {
    return this.demandes.get(dossierId) ?? null;
  }

  async terminer(dossierId: string, modele: string, generation: Generation) {
    const dossier = this.statuts.dossiers.get(dossierId);
    if (dossier?.statut !== 'fiche_en_cours') throw new StatutModifieErreur('fiche_en_cours', dossier?.statut ?? null);
    const precedente = this.fiches.get(dossierId);
    // un échec garde le contenu d'une fiche précédente, comme enregistrer_generation_fiche
    if (!('erreur' in generation) || !precedente) this.fiches.set(dossierId, { modele, generation });
    const nouveau = 'erreur' in generation ? 'erreur' : 'fiche_prete';
    await this.statuts.appliquerTransition({
      cible: 'dossier', id: dossierId, ancien: 'fiche_en_cours', nouveau, auteur: { type: 'systeme' },
      detail: { type: 'statut', cible: 'dossier', ancien: 'fiche_en_cours', nouveau },
    });
    return nouveau;
  }
}
