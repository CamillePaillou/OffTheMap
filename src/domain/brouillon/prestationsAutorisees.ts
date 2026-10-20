/**
 * Prestations que le code laisse au modèle pour le brouillon (E4.4, plan section 5.3) : le modèle ne choisit que
 * parmi elles. Règle pure : prestation active, à la destination demandée, assez grande pour le groupe.
 * Sans destination (« aucune idée »), tout le catalogue actif et assez grand est proposé.
 */
export interface PrestationDuCatalogue {
  id: string;
  type: 'transport' | 'hebergement' | 'activite';
  nom: string;
  destination: string;
  prix_unitaire_cents: number;
  capacite: number;
  actif: boolean;
}

/** « Nantes », « nantes », « Nântes » : même destination. */
const normaliser = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

export function prestationsAutorisees<P extends PrestationDuCatalogue>(catalogue: readonly P[], destination: string | null, participants: number): P[] {
  const cible = destination === null ? null : normaliser(destination);
  return catalogue.filter((p) => p.actif && p.capacite >= participants && (cible === null || normaliser(p.destination) === cible));
}
