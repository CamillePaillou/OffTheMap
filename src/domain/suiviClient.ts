/**
 * Suivi de la demande côté client (espace client, docs/specs/espace-client.md) : les statuts internes du dossier et de
 * sa dernière proposition deviennent une étape lisible, comme le suivi d'un colis. Fonction pure, sans base.
 * Les mots sont ceux du client : rien sur la fiche, l'IA, les alertes ou les vérifications internes.
 */
import type { StatutDossier, StatutProposition } from '../../types/enums';

export const ETAPES_CLIENT = [
  { libelle: 'Demande reçue', detail: 'Elle est enregistrée.' },
  { libelle: 'Étude par un conseiller', detail: 'Il lit vos envies et vos contraintes.' },
  { libelle: 'Proposition en préparation', detail: 'Chaque prix est vérifié auprès du prestataire.' },
  { libelle: 'Proposition envoyée', detail: 'À vous de répondre.' },
  { libelle: 'Acceptée', detail: 'Dépôt de garantie, puis réservation.' },
  { libelle: 'Réservé', detail: 'Bon voyage.' },
] as const;

/** Cas qui sortent de la ligne : la demande attend une précision du client, n'est pas retenue, ou le dossier est clos. */
export type Arret = 'a_completer' | 'non_retenue' | 'clos';

export interface SuiviClient {
  /** Index dans ETAPES_CLIENT de l'étape en cours (la dernière atteinte pour un arrêt). */
  etape: number;
  arret: Arret | null;
  /** Une phrase : ce qui se passe maintenant, ou ce que le client peut faire. */
  message: string;
}

const ETUDE: readonly StatutDossier[] = ['fiche_en_cours', 'fiche_prete', 'erreur', 'validee', 'rdv_propose', 'entretien_fait'];

export function suiviClient(dossier: StatutDossier, proposition: StatutProposition | null): SuiviClient {
  if (dossier === 'a_corriger')
    return { etape: 1, arret: 'a_completer', message: 'Un point de votre demande est à préciser : le conseiller vous a écrit, avec un lien pour la compléter.' };
  if (dossier === 'refusee')
    return { etape: 1, arret: 'non_retenue', message: 'Nous ne pouvons pas composer ce voyage. Le conseiller vous a expliqué pourquoi par e-mail.' };
  if (dossier === 'abandonnee')
    return { etape: proposition ? 3 : 1, arret: 'clos', message: 'Ce dossier est clos. Pour repartir, faites une nouvelle demande.' };
  if (dossier === 'gagnee' || proposition === 'reservee')
    return { etape: 5, arret: null, message: 'Toutes les prestations sont réservées. Le conseiller vous a envoyé la confirmation.' };
  if (dossier === 'nouvelle') return { etape: 0, arret: null, message: 'Un conseiller va lire votre demande.' };
  if (dossier === 'rdv_propose')
    return { etape: 1, arret: null, message: 'Le conseiller vous a proposé un court entretien par e-mail : répondez-lui avec le créneau qui vous va.' };
  if (ETUDE.includes(dossier)) return { etape: 1, arret: null, message: 'Un conseiller étudie votre demande.' };

  // en_proposition : la dernière version de la proposition décide
  switch (proposition) {
    case 'envoyee':
    case 'sans_reponse':
      return { etape: 3, arret: null, message: 'Votre proposition vous attend : acceptez-la ou demandez un changement.' };
    case 'acceptee':
      return { etape: 4, arret: null, message: 'Proposition acceptée. Le conseiller vous indique comment verser le dépôt de garantie.' };
    case 'depot_recu':
      return { etape: 4, arret: null, message: 'Dépôt de garantie reçu. Le conseiller réserve chaque prestation.' };
    case 'changement_demande':
    case 'remplacee':
      return { etape: 2, arret: null, message: 'Le conseiller prépare une nouvelle version avec vos changements.' };
    default:
      return { etape: 2, arret: null, message: 'Le conseiller compose votre proposition et vérifie chaque prix.' };
  }
}

/** Une réponse en ligne n'est possible que sur une proposition envoyée, sans réponse déjà donnée. */
export function peutRepondre(proposition: StatutProposition | null, dejaRepondu: boolean): boolean {
  return !dejaRepondu && (proposition === 'envoyee' || proposition === 'sans_reponse');
}

/** « DT-JADE-NANT », comme la base le range (même règle que normaliser_reference) ; null si la saisie ne peut pas en être un. */
export function normaliserReference(saisie: string): string | null {
  const c = saisie.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^DT(.{8})$/, '$1');
  return c.length === 8 ? `DT-${c.slice(0, 4)}-${c.slice(4)}` : null;
}
