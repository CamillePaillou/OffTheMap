/**
 * Faux client LLM (E0.13) : déterministe, sans réseau, sans clé, sans coût.
 * Tous les tests et `LLM_PROVIDER=fake` l'utilisent. Il garde la trace exacte de ce qu'il a reçu,
 * pour qu'un test puisse vérifier que rien de sensible n'est parti vers le LLM.
 */
import { EcartsIA, FicheIA, schemaBrouillon } from '../../../types';
import type { BrouillonIA, DemandePourLLM } from '../../../types';
import type { EntreeEcarts } from '../../domain/proposition/entreeEcarts';
import { LlmError } from '../../ports/llm-client';
import type { EntreeBrouillon, LlmClient } from '../../ports/llm-client';

export interface OptionsFauxClient {
  /** Réponses imposées (pour tester les cas limites) : remplacent la réponse par défaut. */
  ficheRepondue?: unknown;
  brouillonRepondu?: unknown;
  resumeRepondu?: unknown;
  /** Simule une panne du fournisseur. */
  echec?: LlmError;
}

export class FauxLlmClient implements LlmClient {
  /** Charge utile sérialisée de chaque appel : c'est ce qui partirait sur le réseau. */
  readonly appels: { methode: 'genererFiche' | 'genererBrouillon' | 'resumerEcarts'; charge: string }[] = [];

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
      // les prestations souhaitées par le client (E1.4) d'abord, comme le demande la consigne du vrai modèle
      lignes: [...entree.prestationsAutorisees]
        .sort((a, b) => Number(entree.demande.prestations_souhaitees.includes(b.id)) - Number(entree.demande.prestations_souhaitees.includes(a.id)))
        .slice(0, 3)
        .map((p) => ({
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

  async resumerEcarts(entree: EntreeEcarts): Promise<EcartsIA> {
    this.appels.push({ methode: 'resumerEcarts', charge: JSON.stringify(entree) });
    if (this.options.echec) throw this.options.echec;
    const brute = this.options.resumeRepondu ?? { resume: phraseEcarts(entree) };
    const r = EcartsIA.safeParse(brute);
    if (!r.success) throw new LlmError('reponse_invalide', `résumé non conforme : ${r.error.message}`);
    return r.data;
  }
}

/** Une phrase par prestation, puis le coût : ce que ferait le modèle, sans un seul chiffre. */
function phraseEcarts(e: EntreeEcarts): string {
  const phrases = e.prestations.map((p) => {
    if (p.nature === 'ajoutee') return `Nous avons ajouté ${p.nom}.`;
    if (p.nature === 'retiree') return `Nous avons retiré ${p.nom}.`;
    const quoi = [
      p.jours === 'plus' && (p.type === 'hebergement' ? 'une ou plusieurs nuits en plus' : 'des jours en plus'),
      p.jours === 'moins' && (p.type === 'hebergement' ? 'moins de nuits' : 'moins de jours'),
      p.jours === 'deplaces' && 'de nouvelles dates',
      p.participants === 'plus' && 'davantage de participants',
      p.participants === 'moins' && 'moins de participants',
      p.prix !== 'identique' && !p.jours && !p.participants && (p.prix === 'hausse' ? 'un tarif plus élevé' : 'un tarif plus doux'),
    ].filter(Boolean);
    return `${p.nom} : ${quoi.join(', ') || 'quelques ajustements'}.`;
  });
  const cout = { hausse: 'Le coût total augmente', baisse: 'Le coût total diminue', identique: 'Le coût total ne change pas' }[e.total];
  phrases.push(`${cout}${e.prix_a_confirmer ? ', sous réserve des tarifs que nous confirmons auprès des prestataires' : ''}.`);
  if (e.prestations_inchangees) phrases.push('Le reste du programme est inchangé.');
  return phrases.join(' ');
}

function validerFiche(brute: unknown): FicheIA {
  const r = FicheIA.safeParse(brute);
  if (!r.success) throw new LlmError('reponse_invalide', `fiche non conforme : ${r.error.message}`);
  return r.data;
}
