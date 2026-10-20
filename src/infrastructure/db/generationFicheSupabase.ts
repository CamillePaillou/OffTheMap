import 'server-only';
import type { Json } from '../../../types/database';
import type { DemandeLue } from '../../../types/llm';
import { clientService } from '../../../lib/supabase/service';
import type { Generation, GenerationFicheRepository } from '../../ports/generationFiche';
import { StatutModifieErreur } from '../../ports/statuts';

const COLONNES = 'nom, email, destination, date_debut, date_fin, nb_nuits, voyageurs, budget_annonce_cents, envies, contraintes, regimes, mobilite';

/** Génération de fiche avec la clé service_role (jamais côté navigateur). */
export class GenerationFicheSupabase implements GenerationFicheRepository {
  async lireDemandeCourante(dossierId: string): Promise<DemandeLue | null> {
    const { data, error } = await clientService()
      .from('demandes')
      .select(COLONNES)
      .eq('dossier_id', dossierId)
      .is('remplacee_le', null)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`demande courante : ${error.message}`);
    return (data as DemandeLue | null) ?? null;
  }

  async terminer(dossierId: string, modele: string, generation: Generation) {
    const { data, error } = await clientService().rpc('terminer_generation_fiche', {
      p_dossier: dossierId,
      p_modele: modele,
      p_generation: generation as unknown as Json,
    });
    if (error?.code === 'OT002') throw new StatutModifieErreur('fiche_en_cours', null);
    if (error) throw new Error(`terminer_generation_fiche : ${error.message}`);
    return data as 'fiche_prete' | 'erreur';
  }
}
