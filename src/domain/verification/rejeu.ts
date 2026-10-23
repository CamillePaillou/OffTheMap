/**
 * Mode rejeu de l'agent (E11.3) : pour démontrer la boucle quand OpenRouter est indisponible, les réponses du modèle
 * sont rejouées depuis une vérification enregistrée avec un vrai modèle. Seul le modèle est rejoué : le programme
 * valide chaque appel comme d'habitude, le simulateur est appelé en direct et les faits annoncés sont comparés à sa
 * réponse. Un enregistrement qui ne correspond plus (autre prix, autre ligne) est donc refusé, comme un vrai modèle.
 */
import type { ReponseChat } from '../../ports/modele-agent';
import type { TourTrace } from '../../../types/trace';

export const PREFIXE_REJEU = 'rejeu de ';

export interface CibleRejeu {
  prestation_id: string;
  date: string;
  participants: number;
}

/** Une vérification faite par un vrai modèle, dont les réponses peuvent être rejouées. */
export interface EnregistrementAgent {
  /** Modèle qui a répondu à l'origine (`…:free`). */
  modele: string;
  /** Horodatage du premier tour enregistré. */
  enregistre_le: string;
  ligne: CibleRejeu;
  trace: TourTrace[];
  source?: string;
}

/** Vrai pour une vérification rejouée : l'écran l'annonce. */
export const estRejeu = (modele: string | null | undefined) => !!modele && modele.startsWith(PREFIXE_REJEU);

/** Seul un vrai modèle gratuit d'OpenRouter fait un enregistrement : ni un rejeu, ni le faux client, ni le seed. */
export const estEnregistrementReel = (modele: string) => modele.endsWith(':free') && !estRejeu(modele);

export const memeLigne = (a: CibleRejeu, b: CibleRejeu) =>
  a.prestation_id === b.prestation_id && a.date === b.date && a.participants === b.participants;

/**
 * Les messages du modèle tels qu'il les a rendus, tour par tour : un appel d'outil, ou une conclusion.
 * Un tour sans appel ni conclusion (modèle injoignable) arrête l'enregistrement.
 */
export function messagesDuModele(trace: readonly TourTrace[]): ReponseChat['message'][] {
  const messages: ReponseChat['message'][] = [];
  for (const t of trace) {
    if (t.appel) {
      messages.push({
        content: null,
        tool_calls: [{ id: `rejeu-${t.numero}`, type: 'function', function: { name: t.appel.nom, arguments: JSON.stringify(t.appel.arguments) } }],
      });
    } else if (t.conclusion !== null && t.conclusion !== undefined) {
      messages.push({ content: typeof t.conclusion === 'string' ? t.conclusion : JSON.stringify(t.conclusion) });
    } else {
      break;
    }
  }
  return messages;
}

/** Le dernier enregistrement réel pour cette ligne, ou rien : pas de rejeu « approchant ». */
export function choisirEnregistrement(cible: CibleRejeu, candidats: readonly EnregistrementAgent[]): EnregistrementAgent | null {
  return (
    [...candidats]
      .filter((e) => estEnregistrementReel(e.modele) && memeLigne(e.ligne, cible) && messagesDuModele(e.trace).length > 0)
      .sort((a, b) => b.enregistre_le.localeCompare(a.enregistre_le))[0] ?? null
  );
}
