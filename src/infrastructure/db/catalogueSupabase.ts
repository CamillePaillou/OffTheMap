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

/**
 * Noms des prestations ajoutées depuis le chatbot (E1.4), pour le formulaire public : seulement des prestations
 * actives, dans l'ordre donné, 6 au plus, sans prix. Un identifiant inconnu est ignoré.
 */
export async function nommerPrestations(ids: readonly string[]): Promise<PrestationNommeeCatalogue[]> {
  const valides = [...new Set(ids.filter((id) => /^[a-z0-9-]{1,80}$/.test(id)))].slice(0, 6);
  if (valides.length === 0) return [];
  try {
    const { data, error } = await clientService().from('prestations').select('id, nom, type, destination').eq('actif', true).in('id', valides);
    if (error || !data) return [];
    return valides.map((id) => data.find((p) => p.id === id)).filter((p): p is PrestationNommeeCatalogue => p !== undefined);
  } catch {
    return []; // base injoignable : le formulaire s'affiche sans les prestations, le client peut les décrire
  }
}

export interface PrestationNommeeCatalogue {
  id: string;
  nom: string;
  type: 'transport' | 'hebergement' | 'activite';
  destination: string;
}

/**
 * Villes du catalogue actif, triées : proposées et signalées dans « Après l'entretien ». Une destination hors de cette
 * liste reste permise, mais ne donnerait aucune prestation au brouillon. Liste vide si la base est injoignable.
 */
export async function destinationsCatalogue(): Promise<string[]> {
  try {
    const { data, error } = await clientService().from('prestations').select('destination').eq('actif', true);
    if (error || !data) return [];
    return [...new Set(data.map((p) => p.destination.trim()))].sort((a, b) => a.localeCompare(b, 'fr'));
  } catch {
    return [];
  }
}
