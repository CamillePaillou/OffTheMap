/**
 * Cas d'usage E1.3 : répondre à un visiteur du site, avec l'API prestataires du formateur en lecture seule.
 * Spécification : docs/specs/chatbot.md.
 *
 * - Les messages du visiteur sont minimisés avant l'envoi au modèle (ni e-mail, ni téléphone, ni santé, ni nom).
 * - Deux outils en lecture : chercher_prestations (catalogue sans prix) et verifier_disponibilite (« disponible ou
 *   non », sans prix ni places). Le type des dépendances ne donne accès à aucune écriture.
 * - 3 appels d'outil au plus par message ; au-delà, le modèle doit répondre sans outil.
 * - Simulateur en délai, en erreur ou illisible : arrêt immédiat, réponse fixe « non vérifié », écrite par le code.
 * - Modèle injoignable : réponse fixe, écrite par le code. Aucun nouvel essai.
 * - La réponse du modèle passe par `sansPrix` : aucun montant ne sort, même inventé.
 * - Rien n'est stocké : la conversation vit dans le navigateur, le serveur ne garde ni message ni trace.
 * - La suggestion de préremplissage (destination, date, voyageurs) vient des appels d'outil validés, jamais du texte libre.
 */
import { z } from 'zod';
import { LIMITES } from '../../types/enums';
import { CONSIGNES_CHATBOT } from '../domain/chatbot/connaissances';
import { minimiser } from '../domain/chatbot/minimiser';
import { ArgsChercher, argsVerifier, filtrerCatalogue, OUTILS_CHATBOT, type PrestationSansPrix, type PrestationVisible } from '../domain/chatbot/outils';
import { sansPrix } from '../domain/chatbot/sansPrix';
import { LlmError } from '../ports/llm-client';
import type { AppelOutil, MessageChat, ModeleAgent } from '../ports/modele-agent';
import type { Prestataires } from '../ports/prestataires';
import type { ResultatSimulateur } from '../../types';

export const LIMITES_CHATBOT = {
  appelsOutilsMax: 3, // par message du visiteur
  messagesMax: 12, // historique gardé par le navigateur et renvoyé à chaque message
  longueurMessageMax: 600,
  longueurReponseMax: 900,
} as const;

/** Ce que le navigateur envoie : l'historique de la conversation, dernier message du visiteur à la fin. */
export const ConversationChatbot = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(LIMITES_CHATBOT.longueurMessageMax + 400),
          })
          .strict(),
      )
      .min(1)
      .max(LIMITES_CHATBOT.messagesMax * 2),
  })
  .strict()
  .refine((c) => c.messages.at(-1)?.role === 'user', { message: 'le dernier message doit venir du visiteur' })
  .refine((c) => (c.messages.at(-1)?.content.length ?? 0) <= LIMITES_CHATBOT.longueurMessageMax, {
    message: `${LIMITES_CHATBOT.longueurMessageMax} caractères au plus par message`,
  });
export type ConversationChatbot = z.infer<typeof ConversationChatbot>;

export type Verification = 'disponible' | 'indisponible' | 'non_verifie';

/** Préremplissage du formulaire de demande (E1.1), à partir des appels d'outil acceptés. */
export interface SuggestionDemande {
  destination?: string;
  date_debut?: string;
  voyageurs?: number;
}

export interface ReponseChatbot {
  texte: string;
  verification: Verification | null;
  suggestion: SuggestionDemande | null;
}

export interface DependancesChatbot {
  modele: ModeleAgent;
  /**
   * Lecture seule : ni option, ni réservation, ni annulation. Le catalogue arrive sans prix (simulateur, ou à défaut
   * le catalogue importé par l'agence) ; les disponibilités viennent toujours du simulateur.
   */
  prestataires: {
    catalogue(): Promise<ResultatSimulateur<PrestationSansPrix[]>>;
    disponibilite: Prestataires['disponibilite'];
  };
  maintenant?: () => Date;
}

export const MESSAGES_FIXES = {
  nonVerifie:
    'Je n’ai pas pu joindre nos prestataires à l’instant, donc rien de vérifié. Décrivez votre week-end : un conseiller vérifiera pour vous et vous répondra par e-mail.',
  modeleIndisponible:
    'L’assistant ne répond pas pour le moment. Vous pouvez décrire votre week-end directement : un conseiller vous répondra par e-mail.',
  tropDOutils: 'Je n’ai pas réussi à tout vérifier. Décrivez votre week-end : un conseiller s’en occupe et vous répond par e-mail.',
} as const;

/**
 * Borne la réponse sans couper un mot : à la dernière fin de ligne ou de phrase avant la limite (si elle garde au
 * moins la moitié du texte), sinon au dernier espace, puis « … ».
 */
export function couper(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const debut = texte.slice(0, max - 1);
  const finPhrase = Math.max(debut.lastIndexOf('\n'), debut.lastIndexOf('. ') + 1, debut.lastIndexOf('? ') + 1, debut.lastIndexOf('! ') + 1);
  if (finPhrase >= max / 2) return debut.slice(0, finPhrase).trimEnd();
  const espace = debut.lastIndexOf(' ');
  return `${(espace > 0 ? debut.slice(0, espace) : debut).trimEnd()}…`;
}

export async function repondreChatbot(conversation: ConversationChatbot, deps: DependancesChatbot): Promise<ReponseChatbot> {
  const maintenant = deps.maintenant?.() ?? new Date();
  const historique = conversation.messages.slice(-LIMITES_CHATBOT.messagesMax);
  const messages: MessageChat[] = [
    { role: 'system', content: `${CONSIGNES_CHATBOT}\n\nAujourd’hui : ${maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })}.` },
    // minimisation : les messages du visiteur, mais aussi ceux de l'assistant, qui ont pu les reprendre
    ...historique.map((m): MessageChat => ({ role: m.role, content: minimiser(m.content) })),
  ];

  const suggestion: SuggestionDemande = {};
  let verification: Verification | null = null;
  let catalogue: PrestationVisible[] | null = null; // dernier catalogue lu, pour retrouver la destination d'une prestation
  let appels = 0;

  const fin = (texte: string, v: Verification | null = verification): ReponseChatbot => ({
    texte,
    verification: v,
    suggestion: Object.keys(suggestion).length ? suggestion : null,
  });

  // au plus appelsOutilsMax tours avec outils, puis un dernier tour sans outil pour conclure
  for (let tour = 0; tour <= LIMITES_CHATBOT.appelsOutilsMax; tour++) {
    const avecOutils = appels < LIMITES_CHATBOT.appelsOutilsMax;
    let reponse;
    try {
      reponse = await deps.modele.appeler({ messages, tools: avecOutils ? OUTILS_CHATBOT : [] });
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      return fin(MESSAGES_FIXES.modeleIndisponible, null);
    }

    const demandes = reponse.message.tool_calls ?? [];
    if (demandes.length === 0) {
      const texte = couper(sansPrix((reponse.message.content ?? '').trim()), LIMITES_CHATBOT.longueurReponseMax);
      return fin(texte || MESSAGES_FIXES.tropDOutils);
    }
    if (!avecOutils) return fin(MESSAGES_FIXES.tropDOutils);

    messages.push({ role: 'assistant', content: reponse.message.content, tool_calls: demandes });
    for (const appel of demandes) {
      appels++;
      if (appels > LIMITES_CHATBOT.appelsOutilsMax) {
        repondreOutil(messages, appel, { erreur: 'limite de vérifications atteinte pour ce message : réponds sans outil' });
        continue;
      }
      const r = await executer(appel, deps, maintenant, catalogue);
      if (r.type === 'panne') return fin(MESSAGES_FIXES.nonVerifie, 'non_verifie');
      if (r.type === 'catalogue') {
        catalogue = r.prestations;
        if (r.destination) suggestion.destination = r.destination;
      }
      if (r.type === 'disponibilite') {
        verification = r.disponible ? 'disponible' : 'indisponible';
        if (r.destination) suggestion.destination = r.destination;
        suggestion.date_debut = r.date;
        suggestion.voyageurs = r.participants;
      }
      repondreOutil(messages, appel, r.pourModele);
    }
  }
  return fin(MESSAGES_FIXES.tropDOutils);
}

type Execution =
  | { type: 'panne' }
  | { type: 'erreur'; pourModele: unknown }
  | { type: 'catalogue'; prestations: PrestationVisible[]; destination: string | null; pourModele: unknown }
  | { type: 'disponibilite'; disponible: boolean; date: string; participants: number; destination: string | null; pourModele: unknown };

async function executer(
  appel: AppelOutil,
  deps: DependancesChatbot,
  maintenant: Date,
  catalogue: PrestationVisible[] | null,
): Promise<Execution> {
  let brut: unknown;
  try {
    brut = JSON.parse(appel.function.arguments || '{}');
  } catch {
    return { type: 'erreur', pourModele: { erreur: 'arguments illisibles : JSON attendu' } };
  }

  if (appel.function.name === 'chercher_prestations') {
    const args = ArgsChercher.safeParse(brut);
    if (!args.success) return { type: 'erreur', pourModele: { erreur: 'arguments refusés : destination (Nantes, Lyon, Lille) et type facultatifs' } };
    const r = await deps.prestataires.catalogue();
    if (!r.ok) return r.panne === 'refus' ? { type: 'erreur', pourModele: { erreur: r.code } } : { type: 'panne' };
    const prestations = filtrerCatalogue(r.valeur, args.data);
    const destination = prestations[0] && args.data.destination ? prestations[0].destination : null;
    return { type: 'catalogue', prestations, destination, pourModele: { prestations } };
  }

  if (appel.function.name === 'verifier_disponibilite') {
    const args = argsVerifier(maintenant).safeParse(brut);
    if (!args.success) {
      return {
        type: 'erreur',
        pourModele: { erreur: `arguments refusés : ${args.error.issues.map((i) => i.message).join(', ')} (participants de 1 à ${LIMITES.participantsMax})` },
      };
    }
    const r = await deps.prestataires.disponibilite(args.data);
    if (!r.ok) return r.panne === 'refus' ? { type: 'erreur', pourModele: { erreur: r.code, message: 'prestation inconnue ou demande refusée' } } : { type: 'panne' };
    // le modèle ne reçoit ni prix ni nombre de places : seulement « disponible ou non »
    const connue = catalogue?.find((p) => p.id === args.data.prestation_id);
    return {
      type: 'disponibilite',
      disponible: r.valeur.disponible,
      date: args.data.date,
      participants: args.data.participants,
      destination: connue?.destination ?? null,
      pourModele: { prestation_id: args.data.prestation_id, ...(connue ? { nom: connue.nom } : {}), date: args.data.date, participants: args.data.participants, disponible: r.valeur.disponible },
    };
  }

  // tout autre outil (réserver, poser une option…) n'existe pas pour le chatbot
  return { type: 'erreur', pourModele: { erreur: `outil inconnu : ${appel.function.name.slice(0, 60)}. Seuls chercher_prestations et verifier_disponibilite existent.` } };
}

function repondreOutil(messages: MessageChat[], appel: AppelOutil, contenu: unknown) {
  messages.push({ role: 'tool', tool_call_id: appel.id, content: JSON.stringify(contenu) });
}
