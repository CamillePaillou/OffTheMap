/**
 * Mails modèles (E5.4) : quatre textes fixes, écrits ici, sans aucun texte produit par l'IA.
 * Ils s'ouvrent dans la messagerie du conseiller (mailto) : il les relit, les complète et les envoie lui-même,
 * puis marque le mail « envoyé » dans l'application (journal).
 * Règle : rien ne part avec un prix non vérifié. Les mails de proposition et de confirmation n'acceptent que
 * des lignes au tarif confirmé (ou réservées) : sinon `MailImpossibleErreur`.
 */
import { LIBELLES_CHAMPS, type ChampCorrigeable, type Commentaires } from '../../types/correction';
import type { StatutLigne } from '../../types/enums';

export const MODELES_MAIL = ['rendez_vous', 'a_corriger', 'proposition', 'confirmation'] as const;
export type ModeleMail = (typeof MODELES_MAIL)[number];

export const LIBELLES_MODELES: Record<ModeleMail, string> = {
  rendez_vous: 'Rendez-vous',
  a_corriger: 'Demande à corriger',
  proposition: 'Proposition',
  confirmation: 'Confirmation de réservation',
};

export interface Mail {
  sujet: string;
  corps: string;
}

export class MailImpossibleErreur extends Error {}

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const signature = (conseiller: string) => ['', 'Bien cordialement,', conseiller, 'Detour'];
const texte = (lignes: (string | false | null | undefined)[]) => lignes.filter((l): l is string => typeof l === 'string').join('\n');

export interface Sejour {
  nom: string;
  destination: string | null;
  date_debut: string;
  date_fin: string;
  conseiller: string;
}

/** Après la validation de la demande : proposer un entretien de cadrage. Les créneaux sont à compléter. */
export function mailRendezVous(s: Sejour): Mail {
  return {
    sujet: 'Votre projet de voyage Detour : prenons rendez-vous',
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `Merci pour votre demande${s.destination ? ` de séjour à ${s.destination}` : ''}, du ${date(s.date_debut)} au ${date(s.date_fin)}.`,
      'Nous pouvons construire votre voyage. Pour le préparer avec vous, je vous propose un court entretien téléphonique (20 minutes environ).',
      '',
      'Voici mes disponibilités : [créneaux à compléter]',
      '',
      'Répondez simplement à ce mail avec le créneau qui vous convient, ou proposez-en un autre.',
      ...signature(s.conseiller),
    ]),
  };
}

export interface MailCorrection {
  nom: string;
  points: readonly ChampCorrigeable[];
  commentaires: Commentaires;
  motif: string;
  url: string;
  expireLe: string;
  conseiller: string;
}

/** Demande à corriger (E3.1) : chaque point à revoir, avec le commentaire du conseiller, et le lien de correction. */
export function mailACorriger(m: MailCorrection): Mail {
  return {
    sujet: 'Votre demande de voyage Detour : quelques précisions',
    corps: texte([
      `Bonjour ${m.nom},`,
      '',
      'Merci pour votre demande de voyage. Avant de vous proposer un programme, nous avons besoin de quelques précisions.',
      '',
      m.motif,
      '',
      'Les points à revoir :',
      ...m.points.map((p) => (m.commentaires[p] ? `- ${LIBELLES_CHAMPS[p]} : ${m.commentaires[p]}` : `- ${LIBELLES_CHAMPS[p]}`)),
      '',
      `Vous pouvez compléter votre demande ici : les points à revoir y sont surlignés. Le lien sert une fois et reste valable jusqu’au ${date(m.expireLe)}.`,
      m.url,
      '',
      'Si un point est exact tel quel, vous pourrez simplement le confirmer.',
      ...signature(m.conseiller),
    ]),
  };
}

export interface LigneMail {
  nom: string;
  date: string;
  participants: number;
  statut: StatutLigne;
  /** Tarif confirmé par personne : obligatoire, aucun prix catalogue ni estimé n'est écrit. */
  prix_confirme_cents: number | null;
}

/** Lignes et total à prix vérifiés uniquement. Les lignes remplacées ou indisponibles ne figurent pas. */
function lignesVerifiees(lignes: readonly LigneMail[], statutsAttendus: readonly StatutLigne[]) {
  const retenues = lignes.filter((l) => l.statut !== 'remplacee' && l.statut !== 'indisponible');
  if (retenues.length === 0) throw new MailImpossibleErreur('aucune prestation à présenter');
  for (const l of retenues) {
    if (!statutsAttendus.includes(l.statut) || l.prix_confirme_cents === null) {
      throw new MailImpossibleErreur(`${l.nom} : prix non vérifié`);
    }
  }
  const total = retenues.reduce((s, l) => s + l.prix_confirme_cents! * l.participants, 0);
  const texteLignes = retenues.map(
    (l) => `- ${date(l.date)} · ${l.nom} · ${l.participants} pers. × ${euros(l.prix_confirme_cents!)} = ${euros(l.prix_confirme_cents! * l.participants)}`,
  );
  return { texteLignes, total };
}

/** Proposition envoyée (E5.1) : les prestations à prix vérifiés, le total ; le détail est dans le PDF joint. */
export function mailProposition(s: Sejour, lignes: readonly LigneMail[]): Mail {
  const { texteLignes, total } = lignesVerifiees(lignes, ['confirme', 'reservee']);
  return {
    sujet: `Votre proposition de voyage Detour${s.destination ? ` : ${s.destination}` : ''}`,
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `Voici notre proposition pour votre séjour du ${date(s.date_debut)} au ${date(s.date_fin)}. Tous les prix ont été vérifiés auprès de nos prestataires.`,
      '',
      ...texteLignes,
      '',
      `Total pour le groupe : ${euros(total)}`,
      '',
      'Vous trouverez le programme complet dans le document joint.',
      'Pour accepter cette proposition, répondez simplement à ce mail. Nous vous indiquerons alors le montant du dépôt de garantie.',
      ...signature(s.conseiller),
    ]),
  };
}

/** Réservation confirmée : uniquement des lignes réservées auprès des prestataires. */
export function mailConfirmation(s: Sejour, lignes: readonly LigneMail[]): Mail {
  const { texteLignes, total } = lignesVerifiees(lignes, ['reservee']);
  return {
    sujet: 'Votre voyage Detour est réservé',
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `Bonne nouvelle : votre séjour du ${date(s.date_debut)} au ${date(s.date_fin)} est réservé.`,
      '',
      ...texteLignes,
      '',
      `Total pour le groupe : ${euros(total)}`,
      '',
      'Nous vous enverrons les derniers détails pratiques avant le départ. N’hésitez pas à répondre à ce mail pour toute question.',
      ...signature(s.conseiller),
    ]),
  };
}

export function lienMailto(email: string, mail: Mail) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(mail.sujet)}&body=${encodeURIComponent(mail.corps)}`;
}
