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
      description: 'Liste les prestations du catalogue de l’agence (sans prix), pour une destination et un type facultatifs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          destination: { type: 'string', enum: [...DESTINATIONS] },
          type: { type: 'string', enum: [...TYPES] },
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

/** Ce que le modèle voit d'une prestation : jamais le prix. */
export interface PrestationVisible {
  id: string;
  nom: string;
  type: PrestationCatalogue['type'];
  destination: string;
  description?: string;
}

export function filtrerCatalogue(catalogue: readonly PrestationCatalogue[], args: z.infer<typeof ArgsChercher>, max = 12): PrestationVisible[] {
  const dest = args.destination ? sansAccent(args.destination) : null;
  return catalogue
    .filter((p) => (!dest || sansAccent(p.destination) === dest) && (!args.type || p.type === args.type))
    .slice(0, max)
    .map((p) => ({ id: p.id, nom: p.nom, type: p.type, destination: p.destination, ...(p.description ? { description: p.description.slice(0, 200) } : {}) }));
}
