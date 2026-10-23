/**
 * Comparaison des faits de l'agent au JSON du simulateur (E8.5, critère 4 du contrat de l'agent).
 * Le modèle ne fait pas foi : chaque prix et chaque nombre de places qu'il annonce est comparé
 * à la réponse du simulateur. Un seul écart rend la conclusion invalide (arrêt `reponse_invalide`) ;
 * les écarts sont alors écrits dans la trace (decision.ecarts du tour de conclusion).
 *
 * Règle pure, sans dépendance. Les montants arrivent déjà en centimes : la conversion depuis les
 * euros du simulateur se fait uniquement dans l'adaptateur (src/infrastructure/prestataires).
 */
import type { ConclusionVerification, EcartFait } from '../../../types';

/** Faits relevés dans la réponse du simulateur, convertis par l'adaptateur. */
export interface FaitsServeur {
  disponible: boolean;
  places_restantes: number;
  prix_unitaire_cents: number;
}

export type ResultatComparaison =
  | { valide: true; ecarts: [] }
  | { valide: false; ecarts: EcartFait[] };

/**
 * @param serveur faits du dernier appel réussi au simulateur, `null` si aucun appel n'a abouti.
 */
export function comparerFaits(conclusion: ConclusionVerification, serveur: FaitsServeur | null): ResultatComparaison {
  // Un échec n'annonce ni prix ni places (le type l'interdit) : il n'y a rien à contredire.
  if (conclusion.statut === 'echec') return { valide: true, ecarts: [] };

  // Des faits sans réponse du simulateur sont inventés.
  if (serveur === null) {
    return { valide: false, ecarts: [{ champ: 'reponse_serveur', annonce: conclusion.statut, serveur: null }] };
  }

  const ecarts: EcartFait[] = [];
  const statutServeur = serveur.disponible ? 'ok' : 'indisponible';
  if (conclusion.statut !== statutServeur) {
    ecarts.push({ champ: 'statut', annonce: conclusion.statut, serveur: statutServeur });
  }
  if (conclusion.places_restantes !== serveur.places_restantes) {
    ecarts.push({ champ: 'places_restantes', annonce: conclusion.places_restantes, serveur: serveur.places_restantes });
  }
  if (conclusion.prix_unitaire_cents !== serveur.prix_unitaire_cents) {
    ecarts.push({ champ: 'prix_unitaire_cents', annonce: conclusion.prix_unitaire_cents, serveur: serveur.prix_unitaire_cents });
  }

  return ecarts.length === 0 ? { valide: true, ecarts: [] } : { valide: false, ecarts };
}

/** Raison lisible pour la trace (decision.raison du tour de conclusion, à côté de decision.ecarts). */
export function decrireEcarts(ecarts: readonly EcartFait[]): string {
  return 'conclusion rejetée : ' + ecarts
    .map((e) => `${e.champ} annoncé ${e.annonce}, serveur ${e.serveur ?? 'aucune réponse'}`)
    .join(' ; ');
}
