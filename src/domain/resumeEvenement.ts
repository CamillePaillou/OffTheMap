/**
 * Libellé court d'un événement du journal autre qu'un changement de statut (E5.4, rappels E6.4 et E6.5), pour l'historique de la fiche.
 * Il est construit à partir des seuls champs connus du détail : ni texte libre, ni donnée du client.
 */
import { CHAMPS_CORRIGEABLES, LIBELLES_CHAMPS, REGLES_CORRECTION, type ChampCorrigeable } from '../../types/correction';
import { LIBELLES_MODELES, MODELES_MAIL, type ModeleMail } from './mails';

const estModele = (m: unknown): m is ModeleMail => (MODELES_MAIL as readonly unknown[]).includes(m);
const estPoint = (p: unknown): p is ChampCorrigeable => (CHAMPS_CORRIGEABLES as readonly unknown[]).includes(p);

export function resumeEvenement(type: string, detail: unknown): string | null {
  if ((type !== 'mail' && type !== 'rappel') || typeof detail !== 'object' || detail === null) return null;
  const d = detail as Record<string, unknown>;
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
