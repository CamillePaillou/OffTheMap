import 'server-only';
import { clientService } from '@/lib/supabase/service';
import type { ResultatSimulateur } from '@/types';
import type { PrestationSansPrix } from '@/src/domain/chatbot/outils';

/**
 * Catalogue importé par l'agence (table `prestations`), pour le chatbot du site quand le simulateur ne répond pas.
 * Lu côté serveur ; seules les colonnes sans prix ni capacité sont demandées à la base.
 */
export async function lireCatalogueAgence(): Promise<ResultatSimulateur<PrestationSansPrix[]>> {
  try {
    const { data, error } = await clientService()
      .from('prestations')
      .select('id, type, nom, destination, description, tags')
      .eq('actif', true)
      .order('destination')
      .order('id');
    if (error || !data) return { ok: false, panne: 'erreur_serveur' };
    return {
      ok: true,
      valeur: data.map((p) => ({ id: p.id, type: p.type, nom: p.nom, destination: p.destination, tags: p.tags, ...(p.description ? { description: p.description } : {}) })),
    };
  } catch {
    return { ok: false, panne: 'erreur_serveur' };
  }
}
