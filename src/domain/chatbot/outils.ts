/**
 * Les deux outils du chatbot (E1.3), en lecture seule sur l'API prestataires du formateur :
 * - chercher_prestations : le catalogue, filtré par destination et type, SANS prix ;
 * - verifier_disponibilite : une prestation, une date, un nombre de participants ; le modèle ne reçoit que
 *   « disponible ou non », ni prix ni nombre de places.
 * Options, réservations et annulations n'existent pas ici : le modèle ne peut pas les demander.
 */
import { z } from 'zod';
import { LIMITES } from '../../../types/enums';
import type { DefinitionOutil } from '../../ports/modele-agent';
import type { PrestationCatalogue } from '../../ports/prestataires';

export const DESTINATIONS = ['Nantes', 'Lyon', 'Lille'] as const;
export const TYPES = ['transport', 'hebergement', 'activite'] as const;

export const OUTILS_CHATBOT: readonly DefinitionOutil[] = [
  {
    type: 'function',
    function: {
      name: 'chercher_prestations',
      description: 'Liste les prestations du catalogue des prestataires (nom, description, étiquettes, sans prix), filtrées par destination, type et mots-clés, tous facultatifs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          destination: { type: 'string', enum: [...DESTINATIONS] },
          type: { type: 'string', enum: [...TYPES] },
          mots: { type: 'string', maxLength: 60, description: 'Mots-clés facultatifs cherchés dans le nom, la description et les étiquettes (ex. « intérieur », « cuisine »).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verifier_disponibilite',
      description: 'Dit si une prestation du catalogue est disponible à une date pour un nombre de participants. Ne bloque rien, ne donne aucun prix.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['prestation_id', 'date', 'participants'],
        properties: {
          prestation_id: { type: 'string', pattern: '^[a-z0-9-]+$' },
          date: { type: 'string', description: 'AAAA-MM-JJ' },
          participants: { type: 'integer', minimum: 1, maximum: LIMITES.participantsMax },
        },
      },
    },
  },
];

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const ArgsChercher = z
  .object({
    destination: z.string().max(40).optional(),
    type: z.enum(TYPES).optional(),
    mots: z.string().max(60).optional(),
  })
  .strict();

/** Date AAAA-MM-JJ réelle, pas dans le passé (à la date de Paris). */
const dateFuture = (maintenant: Date) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date au format AAAA-MM-JJ')
    .refine((d) => !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d, 'date inexistante')
    .refine((d) => d >= maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }), 'date passée');

export const argsVerifier = (maintenant: Date) =>
  z
    .object({
      prestation_id: z.string().regex(/^[a-z0-9-]{1,80}$/),
      date: dateFuture(maintenant),
      participants: z.number().int().min(1).max(LIMITES.participantsMax),
    })
    .strict();

/** Le catalogue tel que le chatbot le lit : ni prix ni capacité, la source ne les transmet même pas. */
export type PrestationSansPrix = Omit<PrestationCatalogue, 'prix_unitaire_cents' | 'capacite'>;

/** Ce que le modèle voit d'une prestation : jamais le prix. */
export interface PrestationVisible {
  id: string;
  nom: string;
  type: PrestationCatalogue['type'];
  destination: string;
  description?: string;
  tags: string[];
}

/** Mots vides ignorés dans une recherche par mots-clés. */
const VIDES = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'un', 'une', 'et', 'en', 'a', 'au', 'aux', 'pour', 'avec', 'sans']);
const mots = (s: string) => sansAccent(s).split(/[^a-z0-9]+/).filter((m) => m.length > 1 && !VIDES.has(m));

/** Recherche dans le catalogue. Avec des mots-clés, une prestation qui n'en contient aucun est écartée. */
export function filtrerCatalogue(catalogue: readonly PrestationSansPrix[], args: z.infer<typeof ArgsChercher>, max = 12): PrestationVisible[] {
  const dest = args.destination ? sansAccent(args.destination) : null;
  const cherches = args.mots ? mots(args.mots) : [];
  return catalogue
    .filter((p) => (!dest || sansAccent(p.destination) === dest) && (!args.type || p.type === args.type))
    .filter((p) => {
      if (cherches.length === 0) return true;
      const texte = mots([p.nom, p.description ?? '', ...p.tags].join(' '));
      // « interieur » trouve « intérieur », « gaufre » trouve « gaufres »
      return cherches.some((c) => texte.some((t) => t.startsWith(c) || c.startsWith(t)));
    })
    .slice(0, max)
    .map((p) => ({
      id: p.id, nom: p.nom, type: p.type, destination: p.destination,
      ...(p.description ? { description: p.description.slice(0, 200) } : {}),
      tags: p.tags.slice(0, 6).map((t) => t.slice(0, 30)),
    }));
}
