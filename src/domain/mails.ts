/**
 * Mails modèles (E5.4) : quatre textes fixes, écrits ici, sans aucun texte produit par l'IA.
 * Ils s'ouvrent dans la messagerie du conseiller (mailto) : il les relit, les complète et les envoie lui-même,
 * puis marque le mail « envoyé » dans l'application (journal).
 * Règle : rien ne part avec un prix non vérifié. Les mails de proposition et de confirmation n'acceptent que
 * des lignes au tarif confirmé (ou réservées) et datées : sinon `MailImpossibleErreur`.
 * Ton de voix DÉTOUR (charte 2026) : précis d'abord ; « je » pour le conseiller, qui signe de son prénom, « nous »
 * pour l'agence ; chaque prix avec l'heure de sa vérification ; une pointe d'humour au plus, jamais sur un prix.
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
/** « Camille Martin » → « Camille » : le conseiller signe de son prénom. */
export const prenomDe = (conseiller: string) => conseiller.trim().split(/\s+/)[0] || conseiller;
const signature = (conseiller: string) => ['', 'À bientôt,', prenomDe(conseiller), 'DÉTOUR · Prenez le pas de côté.'];
/** « le 21/10 à 16:42 » */
const verifieLe = (iso: string) => {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
  return `le ${jour} à ${heure}`;
};
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
    sujet: `Votre week-end${s.destination ? ` à ${s.destination}` : ''} : prenons rendez-vous`,
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `Merci pour votre demande${s.destination ? ` de séjour à ${s.destination}` : ''}, du ${date(s.date_debut)} au ${date(s.date_fin)}.`,
      'Je peux vous composer ce voyage. Pour le faire avec vous, je vous propose un court entretien téléphonique, une vingtaine de minutes.',
      '',
      'Mes disponibilités : [créneaux à compléter]',
      '',
      'Répondez simplement à ce mail avec le créneau qui vous va, ou proposez-en un autre.',
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
    sujet: 'Votre demande DÉTOUR : quelques précisions',
    corps: texte([
      `Bonjour ${m.nom},`,
      '',
      'Merci pour votre demande. Avant de vous composer un programme, j’ai besoin de quelques précisions.',
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
  /** Hébergement : nuits depuis `date` ; 1 sinon. */
  nb_nuits: number;
  statut: StatutLigne;
  /** Tarif confirmé par personne (et par nuit pour un hébergement) : obligatoire, aucun prix catalogue ni estimé n'est écrit. */
  prix_confirme_cents: number | null;
  /** Quand ce tarif a été vérifié (ISO) : obligatoire aussi, un prix est toujours daté. */
  verifie_le: string | null;
}

/** Lignes et total à prix vérifiés uniquement. Les lignes remplacées, retirées ou indisponibles ne figurent pas. */
function lignesVerifiees(lignes: readonly LigneMail[], statutsAttendus: readonly StatutLigne[]) {
  const retenues = lignes.filter((l) => l.statut !== 'remplacee' && l.statut !== 'retiree' && l.statut !== 'indisponible');
  if (retenues.length === 0) throw new MailImpossibleErreur('aucune prestation à présenter');
  for (const l of retenues) {
    if (!statutsAttendus.includes(l.statut) || l.prix_confirme_cents === null) {
      throw new MailImpossibleErreur(`${l.nom} : prix non vérifié`);
    }
    if (!l.verifie_le) throw new MailImpossibleErreur(`${l.nom} : prix sans date de vérification`);
  }
  const totalLigne = (l: LigneMail) => l.prix_confirme_cents! * l.participants * l.nb_nuits;
  const total = retenues.reduce((s, l) => s + totalLigne(l), 0);
  const texteLignes = retenues.map(
    (l) =>
      `- ${date(l.date)} · ${l.nom} · ${l.participants} pers.${l.nb_nuits > 1 ? ` × ${l.nb_nuits} nuits` : ''} × ${euros(l.prix_confirme_cents!)} = ${euros(totalLigne(l))}` +
      ` (prix vérifié ${verifieLe(l.verifie_le!)})`,
  );
  return { texteLignes, total };
}

/** Proposition envoyée (E5.1) : les prestations à prix vérifiés, le total ; le détail est dans le PDF joint. */
export function mailProposition(s: Sejour, lignes: readonly LigneMail[]): Mail {
  const { texteLignes, total } = lignesVerifiees(lignes, ['confirme', 'reservee']);
  return {
    sujet: `Votre week-end${s.destination ? ` à ${s.destination}` : ''} : ma proposition`,
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `Voici le séjour que je vous ai composé, du ${date(s.date_debut)} au ${date(s.date_fin)}. J’ai vérifié chaque prix auprès de nos partenaires ; l’heure de la vérification est indiquée.`,
      '',
      ...texteLignes,
      '',
      `Total pour le groupe : ${euros(total)}`,
      '',
      'Le programme jour par jour est dans le document joint.',
      'Pour accepter, répondez simplement à ce mail : je vous indiquerai alors le montant du dépôt de garantie.',
      ...signature(s.conseiller),
    ]),
  };
}

/** Réservation confirmée : uniquement des lignes réservées auprès des prestataires. */
export function mailConfirmation(s: Sejour, lignes: readonly LigneMail[]): Mail {
  const { texteLignes, total } = lignesVerifiees(lignes, ['reservee']);
  return {
    sujet: `Votre week-end${s.destination ? ` à ${s.destination}` : ''} est réservé`,
    corps: texte([
      `Bonjour ${s.nom},`,
      '',
      `C’est confirmé : votre séjour du ${date(s.date_debut)} au ${date(s.date_fin)} est réservé.`,
      '',
      ...texteLignes,
      '',
      `Total pour le groupe : ${euros(total)}`,
      '',
      'Je vous envoie les derniers détails pratiques avant le départ. D’ici là, une question : répondez à ce mail.',
      'Il ne vous restera qu’à monter dans le train.',
      ...signature(s.conseiller),
    ]),
  };
}

export function lienMailto(email: string, mail: Mail) {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(mail.sujet)}&body=${encodeURIComponent(mail.corps)}`;
}
