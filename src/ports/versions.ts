/**
 * Port de la nouvelle version d'une proposition (E6.1). L'adaptateur PostgreSQL lit la version envoyée et crée la
 * suivante par creer_version_suivante : statuts, nouvelle version, lignes, total et alertes écrits ensemble, ou rien.
 */
import type { EntreeChiffrage } from '../domain/chiffrage/chiffrer';
import type { ResultatBrouillon } from './generationBrouillon';
import type { BrouillonIA } from '../../types/ia';
import type { StatutLigne, StatutProposition } from '../../types/enums';
import type { PrestationDuCatalogue } from '../domain/brouillon/prestationsAutorisees';

export interface LigneEnvoyee {
  prestation_id: string;
  date: string;
  participants: number;
  statut: StatutLigne;
  /** La prestation telle qu'elle est AUJOURD'HUI au catalogue : la nouvelle version en copie le prix. */
  prestation: PrestationDuCatalogue;
}

export interface VersionEnvoyee {
  statut: StatutProposition;
  programme: BrouillonIA['programme'] | null;
  lignes: LigneEnvoyee[];
  /** Voyageurs, séjour, nuits et budget de référence du dossier, pour le chiffrage. */
  reference: Omit<EntreeChiffrage, 'lignes'>;
}

export class VersionModifieeErreur extends Error {}

export interface VersionsRepository {
  /** null si la proposition n'existe pas. */
  lireVersionEnvoyee(propositionId: string): Promise<VersionEnvoyee | null>;
  /** Rejette VersionModifieeErreur si la proposition n'est plus envoyée. Renvoie l'id de la version suivante. */
  creerVersionSuivante(propositionId: string, conseillerId: string, motif: string, resultat: Exclude<ResultatBrouillon, { erreur: string }>): Promise<string>;
}
