import 'server-only';
import type { Json } from '../../../types/database';
import { clientService } from '../../../lib/supabase/service';
import type { Cible, StatutDe } from '../../domain/transition';
import { StatutModifieErreur, type EcritureTransition, type StatutsRepository } from '../../ports/statuts';

/** Statuts par la fonction SQL changer_statut (E0.7), avec la clé service_role : statut et journal écrits ensemble. */
export class StatutsSupabase implements StatutsRepository {
  async lireStatut<C extends Cible>(cible: C, id: string) {
    const table = cible === 'dossier' ? 'dossiers' : 'propositions';
    const { data, error } = await clientService().from(table).select('statut').eq('id', id).maybeSingle();
    if (error) throw new Error(`lecture du statut : ${error.message}`);
    return (data?.statut ?? null) as StatutDe<C> | null;
  }

  async appliquerTransition<C extends Cible>(e: EcritureTransition<C>): Promise<string> {
    const { data, error } = await clientService().rpc('changer_statut', {
      p_cible: e.cible,
      p_id: e.id,
      p_ancien: e.ancien,
      p_nouveau: e.nouveau,
      p_auteur: e.auteur.type,
      p_auteur_id: e.auteur.type === 'conseiller' ? e.auteur.id : null,
      p_detail: e.detail as unknown as Json,
    });
    if (error?.code === 'OT002') throw new StatutModifieErreur(e.ancien, null);
    if (error) throw new Error(`changer_statut : ${error.message}`);
    return String(data);
  }
}
