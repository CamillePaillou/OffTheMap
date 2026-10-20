/**
 * Fixtures du dashboard (E0.12), validées au chargement : un écran peut s'afficher sans la base.
 * Remplacées par les vraies routes (/api/dossiers, /api/propositions) quand elles existeront.
 */
import { DetailDossier, ListeDossiers, Proposition } from '../../types/dashboard';
import detail from './detail-dossier.json';
import liste from './liste-dossiers.json';
import proposition from './proposition.json';

export const LISTE_DOSSIERS: ListeDossiers = ListeDossiers.parse(liste);
export const DETAIL_DOSSIER: DetailDossier = DetailDossier.parse(detail);
export const PROPOSITION: Proposition = Proposition.parse(proposition);
