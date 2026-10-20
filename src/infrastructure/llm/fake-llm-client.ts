/**
 * Faux client LLM (E0.13) : déterministe, sans réseau, sans clé, sans coût.
 * Tous les tests et `LLM_PROVIDER=fake` l'utilisent. Il garde la trace exacte de ce qu'il a reçu,
 * pour qu'un test puisse vérifier que rien de sensible n'est parti vers le LLM.
 */
import { FicheIA, schemaBrouillon } from '../../../types';
import type { BrouillonIA, DemandePourLLM } from '../../../types';
import { LlmError } from '../../ports/llm-client';
import type { EntreeBrouillon, LlmClient } from '../../ports/llm-client';

export interface OptionsFauxClient {
  /** Réponses imposées (pour tester les cas limites) : remplacent la réponse par défaut. */
  ficheRepondue?: unknown;
  brouillonRepondu?: unknown;
  /** Simule une panne du fournisseur. */
  echec?: LlmError;
}

export class FauxLlmClient implements LlmClient {
  /** Charge utile sérialisée de chaque appel : c'est ce qui partirait sur le réseau. */
  readonly appels: { methode: 'genererFiche' | 'genererBrouillon'; charge: string }[] = [];

  constructor(private readonly options: OptionsFauxClient = {}) {}

  async genererFiche(demande: DemandePourLLM): Promise<FicheIA> {
    this.appels.push({ methode: 'genererFiche', charge: JSON.stringify(demande) });
    if (this.options.echec) throw this.options.echec;
    const brute = this.options.ficheRepondue ?? {
      envies: demande.envies ? [demande.envies.slice(0, 200)] : [],
      contraintes: demande.contraintes ? [demande.contraintes.slice(0, 200)] : [],
      regimes: demande.regimes,
      mobilite: demande.mobilite,
      niveau_physique: null, // déduit des envies par le vrai modèle ; le formulaire ne le demande pas
      points_flous: demande.destination ? [] : ['destination non précisée'],
    };
    return validerFiche(brute);
  }

  async genererBrouillon(entree: EntreeBrouillon): Promise<BrouillonIA> {
    this.appels.push({ methode: 'genererBrouillon', charge: JSON.stringify(entree) });
    if (this.options.echec) throw this.options.echec;
    const ids = entree.prestationsAutorisees.map((p) => p.id);
    const jour = entree.demande.date_debut;
    const brute = this.options.brouillonRepondu ?? {
      programme: [{ date: jour, titre: 'Programme proposé', texte: 'Journée construite à partir des prestations retenues.' }],
      lignes: entree.prestationsAutorisees.slice(0, 3).map((p) => ({
        prestation_id: p.id,
        date: jour,
        participants: entree.participants,
      })),
      ecartes: [],
    };
    const r = schemaBrouillon(ids, entree.participants).safeParse(brute);
    if (!r.success) throw new LlmError('reponse_invalide', `brouillon non conforme : ${r.error.message}`);
    return r.data;
  }
}

function validerFiche(brute: unknown): FicheIA {
  const r = FicheIA.safeParse(brute);
  if (!r.success) throw new LlmError('reponse_invalide', `fiche non conforme : ${r.error.message}`);
  return r.data;
}
