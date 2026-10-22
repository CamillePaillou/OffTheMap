/**
 * Libellé court d'un événement du journal autre qu'un changement de statut (E5.4, rappels E6.4 et E6.5, options et
 * annulation E9.4 à E9.8, remplacement et retrait après le dépôt E7.4), pour l'historique de la fiche.
 * Il est construit à partir des seuls champs connus du détail : ni texte libre, ni donnée du client.
 */
import { LIBELLES_CHAMPS, REGLES_CORRECTION, estChampCorrigeable as estPoint } from '../../types/correction';
import { LIBELLES_MODELES, MODELES_MAIL, type ModeleMail } from './mails';

const estModele = (m: unknown): m is ModeleMail => (MODELES_MAIL as readonly unknown[]).includes(m);

// événements `option` : pose, confirmation et annulation, réussies ou non, et tentatives refusées avant tout envoi (E7.4)
const OPTION: Record<string, [ok: string, echec: string]> = {
  option: ['Option posée chez le prestataire', 'Pose de l’option échouée'],
  confirmation: ['Réservation confirmée', 'Confirmation de la réservation échouée'],
  annulation: ['Réservation annulée chez le prestataire', 'Annulation de la réservation échouée'],
};
const TENTATIVE: Record<string, string> = {
  tentative_refusee: 'Pose de l’option refusée avant envoi',
  tentative_confirmation: 'Confirmation refusée avant envoi',
  tentative_annulation: 'Annulation refusée avant envoi',
};

export function resumeEvenement(type: string, detail: unknown): string | null {
  if (!['mail', 'rappel', 'option', 'changement'].includes(type) || typeof detail !== 'object' || detail === null) return null;
  const d = detail as Record<string, unknown>;
  // E7.4 : changement de prestation après le dépôt, avec l'accord du client
  if (type === 'changement') {
    if (d.type === 'remplacement') return 'Prestation indisponible remplacée, avec l’accord du client';
    if (d.type === 'retrait') return 'Prestation indisponible retirée, avec l’accord du client';
    return null;
  }
  if (type === 'option') {
    if (typeof d.type === 'string' && d.type in OPTION) return OPTION[d.type][d.ok === true ? 0 : 1];
    return typeof d.type === 'string' && d.type in TENTATIVE ? TENTATIVE[d.type] : null;
  }
  // rappel au conseiller quand le client ne répond pas (E6.4) ; à J+14, l'abandon du dossier est proposé (E6.5)
  if (d.type === 'rappel' && d.jour === 14) return 'Rappel J+14 : pas de réponse du client, abandon du dossier proposé';
  if (d.type === 'rappel' && typeof d.jour === 'number') return `Rappel J+${d.jour} : pas de réponse du client à la proposition`;
  if (d.type === 'mail' && estModele(d.modele)) return `Mail « ${LIBELLES_MODELES[d.modele]} » envoyé`;
  if (d.type === 'correction_demandee' && Array.isArray(d.champs)) {
    const points = d.champs.filter(estPoint).map((p) => LIBELLES_CHAMPS[p]).join(', ');
    const boucle = typeof d.boucle === 'number' ? ` (correction ${d.boucle}/${REGLES_CORRECTION.bouclesMax})` : '';
    return `Lien de correction créé : ${points}${boucle}`;
  }
  return null;
}
