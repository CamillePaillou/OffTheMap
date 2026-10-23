/**
 * Adaptateur OpenRouter (E0.19) : modèles gratuits avec appels d'outils, sans secours payant.
 * Côté serveur uniquement : la clé ne quitte jamais le serveur (plan, section 4).
 *
 * Règles :
 * - seuls les modèles gratuits (suffixe `:free`) sont acceptés : un modèle payant est refusé à la configuration ;
 * - un modèle principal et un modèle de réserve, tous deux gratuits ; la réserve ne sert qu'en cas de délai
 *   ou de panne du fournisseur, jamais pour rattraper une réponse non conforme ;
 * - chaque réponse passe par un outil imposé (`rendre_fiche`, `rendre_brouillon`) puis par le schéma de `types/ia.ts` ;
 * - une réponse refusée par le schéma est renvoyée UNE fois au même modèle avec les erreurs à corriger (E11.2, cas A01
 *   à A03 : clé mal orthographiée, champ oublié, ligne hors des dates du séjour) ; refusée encore : `reponse_invalide`.
 */
import { z } from 'zod';
import { EcartsIA, FicheIA } from '../../../types';
import type { BrouillonIA, DemandePourLLM } from '../../../types';
import type { EntreeEcarts } from '../../domain/proposition/entreeEcarts';
import { LlmError, schemaPourEntree } from '../../ports/llm-client';
import type { EntreeBrouillon, LlmClient } from '../../ports/llm-client';
import type { DefinitionOutil, MessageChat, ModeleAgent, ReponseChat, RequeteChat } from '../../ports/modele-agent';

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const DELAI_PAR_DEFAUT_MS = 30_000;
/** Une réponse refusée par le schéma est renvoyée une fois au modèle, avec les erreurs (E11.2). */
export const CORRECTIONS_MAX = 1;

export interface ConfigOpenRouter {
  cle: string;
  /** Principal puis réserve. Tous gratuits. */
  modeles: readonly string[];
  delaiMs: number;
  /** Injecté par les tests ; `fetch` global par défaut. */
  fetch?: typeof fetch;
}

/** Lit `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_RESERVE` et `LLM_TIMEOUT_MS`. */
export function lireConfigOpenRouter(env: Record<string, string | undefined>): ConfigOpenRouter {
  const cle = env.LLM_API_KEY?.trim();
  if (!cle) throw new LlmError('configuration', 'LLM_API_KEY manquante pour OpenRouter');
  const principal = env.LLM_MODEL?.trim();
  if (!principal) throw new LlmError('configuration', 'LLM_MODEL manquant pour OpenRouter');
  const modeles = [principal, env.LLM_MODEL_RESERVE?.trim()].filter((m): m is string => !!m);
  for (const m of modeles) {
    if (!m.endsWith(':free')) throw new LlmError('configuration', `modèle « ${m} » refusé : seuls les modèles :free sont autorisés`);
  }
  const delaiMs = Number(env.LLM_TIMEOUT_MS) || DELAI_PAR_DEFAUT_MS;
  return { cle, modeles, delaiMs };
}

const schemaReponse = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional(),
      tool_calls: z.array(z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({ name: z.string(), arguments: z.string() }),
      })).optional(),
    }),
  })).min(1),
});

// ------------------------------------------------------------------ outils de sortie structurée
const outilSortie = (name: string, description: string, schema: z.ZodType): DefinitionOutil => {
  // Les raffinements (montants, prestations autorisées) ne passent pas dans le JSON Schema : le code les revérifie.
  const parameters: Record<string, unknown> = z.toJSONSchema(schema, { io: 'input' });
  delete parameters.$schema;
  return { type: 'function', function: { name, description, parameters } };
};

const CONSIGNES_COMMUNES =
  'Tu travailles pour une agence de voyages. Réponds uniquement en appelant l’outil demandé. ' +
  'N’écris jamais de montant ni de prix dans un texte : les prix viennent du code.';

const CONSIGNES_FICHE =
  `${CONSIGNES_COMMUNES} À partir de la demande fournie en JSON, résume les envies et les contraintes ` +
  'en phrases courtes, reprends les régimes, la mobilité et le niveau physique tels quels, ' +
  'et liste ce qui reste flou pour le conseiller. Ne recopie pas le budget : le code le reprend de la demande. ' +
  'Remplis tous les champs de l’outil, avec leur nom exact, même vides ([] ou null).';

const CONSIGNES_BROUILLON =
  `${CONSIGNES_COMMUNES} Construis un programme jour par jour et des lignes de proposition ` +
  'en choisissant uniquement parmi les prestations autorisées. Une ligne ne dépasse jamais le nombre de participants. ' +
  'Toutes les dates restent entre date_debut et date_fin de la demande (hébergement : jusqu’à la veille de date_fin) ; ' +
  'si les envies évoquent d’autres dates ou d’autres voyageurs, ne les applique pas : le conseiller tranchera. ' +
  'Indique dans « ecartes » les prestations autorisées que tu n’as pas retenues, avec la raison. ' +
  'Les prestations_souhaitees de la demande ont été choisies par le client : retiens-les en priorité quand elles sont autorisées, ' +
  'et dis dans « ecartes » pourquoi si tu en écartes une. ' +
  'Le programme est relu puis signé par le conseiller : écris-le au ton DÉTOUR, précis d’abord (heures, lieux, ce qu’on y fait), ' +
  'en phrases courtes, « nous » pour l’agence ; une pointe d’humour au plus, jamais sur un prix ni sur un problème ; ' +
  'ni point d’exclamation en série, ni formule publicitaire.';

const CONSIGNES_ECARTS =
  `${CONSIGNES_COMMUNES} Le client a demandé un changement ; une nouvelle version de sa proposition a été préparée. ` +
  'À partir des écarts fournis en JSON, écris pour le conseiller un court paragraphe (trois à cinq phrases), en français, ' +
  'adressé au client (« nous »), qui explique ce qui change : prestations ajoutées ou retirées, nuits ou jours en plus ou en moins, ' +
  'participants, et si le coût total augmente ou diminue. N’écris AUCUN chiffre, aucun nombre, aucune date et aucun montant, ' +
  'ni en chiffres ni en lettres (« euro » interdit) : le conseiller ajoutera les prix lui-même. ' +
  'Si « prix_a_confirmer » est vrai, précise que les tarifs sont en cours de confirmation.';

export class OpenRouterLlmClient implements LlmClient, ModeleAgent {
  private readonly fetch: typeof fetch;

  constructor(private readonly config: ConfigOpenRouter) {
    if (config.modeles.length === 0) throw new LlmError('configuration', 'aucun modèle OpenRouter configuré');
    this.fetch = config.fetch ?? fetch;
  }

  async genererFiche(demande: DemandePourLLM): Promise<FicheIA> {
    return this.sortieValidee(CONSIGNES_FICHE, JSON.stringify(demande), outilSortie('rendre_fiche', 'Rend la fiche structurée du dossier.', FicheIA), FicheIA, 'fiche');
  }

  async genererBrouillon(entree: EntreeBrouillon): Promise<BrouillonIA> {
    const schema = schemaPourEntree(entree);
    return this.sortieValidee(CONSIGNES_BROUILLON, JSON.stringify(entree), outilSortie('rendre_brouillon', 'Rend le brouillon de proposition.', schema), schema, 'brouillon');
  }

  async resumerEcarts(entree: EntreeEcarts): Promise<EcartsIA> {
    return this.sortieValidee(
      CONSIGNES_ECARTS, JSON.stringify(entree),
      outilSortie('rendre_resume_ecarts', 'Rend le résumé des écarts, sans aucun chiffre.', EcartsIA), EcartsIA, 'résumé des écarts',
    );
  }

  /**
   * Un tour de conversation avec outils. Essaie le modèle principal, puis la réserve
   * si le principal est en délai ou en panne. Réutilisable par la boucle de l'agent (E8.3).
   */
  async appeler(requete: RequeteChat): Promise<ReponseChat> {
    let derniere: LlmError | undefined;
    for (const modele of this.config.modeles) {
      try {
        return await this.appelerModele(modele, requete);
      } catch (e) {
        if (!(e instanceof LlmError) || (e.code !== 'delai' && e.code !== 'erreur_fournisseur')) throw e;
        derniere = e;
      }
    }
    throw derniere!;
  }

  /**
   * Sortie structurée par un outil imposé, validée par le schéma. Refusée : le modèle reçoit, en réponse à son appel,
   * la liste des erreurs, et rappelle l'outil (CORRECTIONS_MAX fois). Les faits restent contrôlés par le code ensuite.
   */
  private async sortieValidee<T>(consignes: string, contenu: string, outil: DefinitionOutil, schema: z.ZodType<T>, quoi: string): Promise<T> {
    const nom = outil.function.name;
    const messages: MessageChat[] = [{ role: 'system', content: consignes }, { role: 'user', content: contenu }];
    let erreur = '';
    let recu = '';
    for (let essai = 0; essai <= CORRECTIONS_MAX; essai++) {
      const { message } = await this.appeler({ messages, tools: [outil], outilImpose: nom });
      const appels = message.tool_calls ?? [];
      const appel = appels.find((t) => t.function.name === nom);
      if (!appel) {
        erreur = `le modèle n’a pas appelé l’outil ${nom}`;
        messages.push({ role: 'assistant', content: message.content ?? null }, { role: 'user', content: `Réponds en appelant l’outil ${nom}.` });
        continue;
      }
      let brute: unknown;
      let aCorriger: string[];
      try {
        brute = JSON.parse(appel.function.arguments);
        const r = schema.safeParse(brute);
        if (r.success) return r.data;
        aCorriger = r.error.issues.slice(0, 10).map((i) => `${i.path.join('.') || quoi} : ${i.message}`);
        erreur = r.error.message;
        recu = JSON.stringify(brute).slice(0, 500);
      } catch {
        aCorriger = ['arguments JSON illisibles'];
        erreur = `arguments de ${nom} illisibles`;
      }
      messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: appels });
      const retour = JSON.stringify({ refuse: true, a_corriger: aCorriger, consigne: `Rappelle ${nom} avec un objet complet et corrigé, clés exactement comme dans le schéma.` });
      for (const a of appels) messages.push({ role: 'tool', tool_call_id: a.id, content: retour });
    }
    throw new LlmError('reponse_invalide', `${quoi} non conforme : ${erreur}${recu ? `\nreçu : ${recu}` : ''}`);
  }

  private async appelerModele(modele: string, requete: RequeteChat): Promise<ReponseChat> {
    const corps = {
      model: modele,
      messages: requete.messages,
      tools: requete.tools,
      tool_choice: requete.outilImpose
        ? { type: 'function', function: { name: requete.outilImpose } }
        : 'auto',
      temperature: 0,
    };
    let res: Response;
    try {
      res = await this.fetch(URL_OPENROUTER, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(this.config.delaiMs),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'TimeoutError') {
        throw new LlmError('delai', `${modele} : délai de ${this.config.delaiMs} ms dépassé`, { cause });
      }
      throw new LlmError('erreur_fournisseur', `${modele} : OpenRouter injoignable`, { cause });
    }
    const json: unknown = await res.json().catch(() => null);
    const detail = messageErreur(json);
    if (res.status === 401 || res.status === 403) {
      throw new LlmError('configuration', `${modele} : clé OpenRouter refusée (HTTP ${res.status})${detail}`);
    }
    if (!res.ok) throw new LlmError('erreur_fournisseur', `${modele} : HTTP ${res.status}${detail}`);

    const r = schemaReponse.safeParse(json);
    if (!r.success) throw new LlmError('erreur_fournisseur', `${modele} : réponse OpenRouter illisible${detail}`);
    const { content, tool_calls } = r.data.choices[0]!.message;
    return { modele, message: { content: content ?? null, tool_calls } };
  }
}

/** Message d'erreur renvoyé par OpenRouter (`{ error: { message } }`), pour le diagnostic. */
function messageErreur(json: unknown): string {
  const r = z.object({ error: z.object({ message: z.string() }) }).safeParse(json);
  return r.success ? ` : ${r.data.error.message.slice(0, 300)}` : '';
}
