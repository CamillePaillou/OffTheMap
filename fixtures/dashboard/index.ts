/**
 * Fixtures du dashboard (E0.12), validées au chargement : un écran peut s'afficher sans la base.
 * Remplacées par les vraies routes (/api/dossiers, /api/propositions) quand elles existeront.
 */
import { z } from 'zod';
import { DetailDossier, ListeDossiers, Proposition, VerificationLigne } from '../../types/dashboard';
import detail from './detail-dossier.json';
import liste from './liste-dossiers.json';
import proposition from './proposition.json';
import propositionDepotRecu from './proposition-depot-recu.json';
import verifications from './verifications.json';

export const LISTE_DOSSIERS: ListeDossiers = ListeDossiers.parse(liste);
export const DETAIL_DOSSIER: DetailDossier = DetailDossier.parse(detail);
export const PROPOSITION: Proposition = Proposition.parse(proposition);

/** Proposition au statut `depot_recu` (E9.3) : 2 lignes confirmées par l'agent, 1 indisponible. Sert à l'écran d'accord. */
export const PROPOSITION_DEPOT_RECU: Proposition = Proposition.parse(propositionDepotRecu);
export const VERIFICATIONS: VerificationLigne[] = z.array(VerificationLigne).parse(verifications);
