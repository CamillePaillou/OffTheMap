/**
 * Catalogue du chatbot (E1.3) : celui du simulateur des prestataires, sans prix ni capacité. Si le simulateur ne
 * répond pas (clé d'équipe absente, délai, panne), le chatbot lit le catalogue que l'agence en a importé
 * (table `prestations`) : le visiteur sait toujours ce qu'on propose. Les disponibilités, elles, viennent seulement
 * du simulateur : sans lui, le chatbot dit qu'il n'a pas pu vérifier.
 */
import type { ResultatSimulateur } from '../../../types';
import type { PrestationSansPrix } from '../../domain/chatbot/outils';
import type { PrestationCatalogue } from '../../ports/prestataires';

export type LectureCatalogue = () => Promise<ResultatSimulateur<PrestationSansPrix[]>>;

const sansPrix = (p: PrestationCatalogue): PrestationSansPrix => ({
  id: p.id, type: p.type, nom: p.nom, destination: p.destination, tags: p.tags, ...(p.description !== undefined ? { description: p.description } : {}),
});

export function catalogueAvecSecours(
  simulateur: (() => Promise<ResultatSimulateur<PrestationCatalogue[]>>) | null,
  secours: LectureCatalogue,
): LectureCatalogue {
  return async () => {
    if (simulateur) {
      const r = await simulateur();
      if (r.ok && r.valeur.length > 0) return { ok: true, valeur: r.valeur.map(sansPrix) };
    }
    return secours();
  };
}
