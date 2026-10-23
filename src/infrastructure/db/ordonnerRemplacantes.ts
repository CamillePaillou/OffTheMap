import type { TypePrestation } from '../../../types';

/** Ordre de la liste de remplacement (E5.2) : la même prestation (autre date), puis le même type, puis le reste, par nom. */
export function ordonnerRemplacantes<P extends { id: string; nom: string; type: TypePrestation }>(
  prestations: readonly P[],
  actuelle: { id: string; type: TypePrestation },
): P[] {
  const rang = (p: P) => (p.id === actuelle.id ? 0 : p.type === actuelle.type ? 1 : 2);
  return [...prestations].sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, 'fr'));
}

const ORDRE_TYPES: readonly TypePrestation[] = ['hebergement', 'transport', 'activite'];

/** Ordre de la liste d'ajout (E6.6) : hébergements (le cas « une nuit de plus »), transports, activités, puis par nom. */
export function ordonnerAjoutables<P extends { nom: string; type: TypePrestation }>(prestations: readonly P[]): P[] {
  return [...prestations].sort((a, b) => ORDRE_TYPES.indexOf(a.type) - ORDRE_TYPES.indexOf(b.type) || a.nom.localeCompare(b.nom, 'fr'));
}
