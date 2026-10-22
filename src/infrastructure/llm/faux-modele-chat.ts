/**
 * Faux modèle du chatbot (E1.3) : déterministe, sans réseau ni clé. Utilisé quand `LLM_PROVIDER=fake`, pour que le
 * chatbot marche en développement et en démonstration sans OpenRouter. Il comprend quelques tournures simples
 * (destination, date, nombre de voyageurs, demande de réservation) et utilise les mêmes outils que le vrai modèle.
 * Il ne remplace pas le vrai modèle : il montre le parcours, pas la conversation.
 */
import type { ModeleAgent, ReponseChat, RequeteChat } from '../../ports/modele-agent';

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function lireDestination(texte: string): string | null {
  const m = plat(texte).match(/\b(nantes|lyon|lille)\b/);
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1) : null;
}

/** « 7 novembre », « le 07/11 », « 2026-11-07 » → AAAA-MM-JJ, l'année étant la prochaine où la date n'est pas passée. */
export function lireDate(texte: string, aujourdhui: string): string | null {
  const t = plat(texte);
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  let jour: number | null = null;
  let mois: number | null = null;
  const enLettres = t.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/);
  const enChiffres = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (enLettres) [jour, mois] = [Number(enLettres[1]), MOIS.indexOf(enLettres[2]!) + 1];
  else if (enChiffres) [jour, mois] = [Number(enChiffres[1]), Number(enChiffres[2])];
  if (!jour || !mois || mois > 12 || jour > 31) return null;
  let annee = Number(aujourdhui.slice(0, 4));
  const fmt = (a: number) => `${a}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
  if (fmt(annee) < aujourdhui) annee++;
  return fmt(annee);
}

/** « pour deux », « 3 personnes », « à quatre », « 2 adultes » → nombre de voyageurs. */
export function lireVoyageurs(texte: string): number | null {
  const t = plat(texte);
  const m = t.match(/\b(?:pour|a|nous sommes)\s+(\d{1,2}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b|\b(\d{1,2}|deux|trois|quatre|cinq|six)\s+(?:personnes?|voyageurs?|adultes?|pers)\b/);
  const mot = m?.[1] ?? m?.[2];
  if (!mot) return null;
  const n = NOMBRES[mot] ?? Number(mot);
  return n >= 1 && n <= 20 ? n : null;
}

const NOMS_TYPES = { transport: 'transport', hebergement: 'hébergement', activite: 'activité' } as const;

export class FauxModeleChat implements ModeleAgent {
  async appeler(requete: RequeteChat): Promise<ReponseChat> {
    const msgs = requete.messages;
    const outilsPermis = requete.tools.length > 0;
    const aujourdhui = /Aujourd’hui : (\d{4}-\d{2}-\d{2})/.exec(String(msgs[0]?.content))?.[1] ?? new Date().toISOString().slice(0, 10);
    const visiteur = msgs.filter((m) => m.role === 'user').map((m) => String(m.content));
    const dernierVisiteur = visiteur.at(-1) ?? '';
    // ce que le visiteur a dit depuis le début : il peut donner la date dans un message et la ville dans un autre
    const toutVisiteur = visiteur.join(' ');
    const dernier = msgs.at(-1)!;
    const reponse = (content: string): ReponseChat => ({ modele: 'faux-modele-chat', message: { content } });
    const outil = (name: string, args: object): ReponseChat => ({
      modele: 'faux-modele-chat',
      message: { content: null, tool_calls: [{ id: `faux-${msgs.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    });

    const destination = lireDestination(toutVisiteur);
    const date = lireDate(toutVisiteur, aujourdhui);
    const voyageurs = lireVoyageurs(toutVisiteur);

    if (dernier.role === 'tool') {
      const resultat = JSON.parse(dernier.content) as Record<string, unknown>;
      if (Array.isArray(resultat.prestations)) {
        const prestations = resultat.prestations as { id: string; nom: string; type: keyof typeof NOMS_TYPES }[];
        if (prestations.length === 0) return reponse('Je ne trouve pas de prestation pour cette demande. Décrivez votre week-end : un conseiller cherchera pour vous.');
        const activite = prestations.find((p) => p.type === 'activite') ?? prestations[0]!;
        if (outilsPermis && date && voyageurs) return outil('verifier_disponibilite', { prestation_id: activite.id, date, participants: voyageurs });
        const liste = prestations.slice(0, 4).map((p) => `${p.nom} (${NOMS_TYPES[p.type] ?? p.type})`).join(', ');
        return reponse(`${destination ? `À ${destination}` : 'Au catalogue'}, nous proposons notamment : ${liste}. Donnez-moi une date et le nombre de voyageurs : je vérifie la disponibilité.`);
      }
      if (typeof resultat.disponible === 'boolean') {
        const nom = typeof resultat.nom === 'string' ? resultat.nom : 'Cette prestation';
        const quand = new Date(`${resultat.date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
        const qui = `${resultat.participants} personne${Number(resultat.participants) > 1 ? 's' : ''}`;
        return reponse(
          resultat.disponible
            ? `Bonne nouvelle : ${nom} est disponible le ${quand} pour ${qui}. Pour le prix et le reste du séjour, décrivez votre week-end : un conseiller vous envoie une proposition avec des prix vérifiés.`
            : `${nom} n’est pas disponible le ${quand} pour ${qui}. Un conseiller peut vous proposer une autre date ou une autre idée : décrivez votre week-end.`,
        );
      }
      return reponse('Je n’ai pas pu vérifier cela. Décrivez votre week-end : un conseiller s’en occupe.');
    }

    const question = plat(dernierVisiteur);
    if (/\b(reserv|book|bloque|confirm)/.test(question)) {
      return reponse('Je ne peux pas réserver moi-même : un conseiller prépare votre séjour, vérifie chaque prix et confirme les réservations après votre accord. Décrivez votre week-end pour commencer.');
    }
    if (/\b(prix|combien|tarif|cout|budget)\b/.test(question)) {
      return reponse('Je ne donne pas de prix : un conseiller vérifie chaque tarif auprès des prestataires et vous envoie une proposition chiffrée. Décrivez votre week-end, c’est gratuit et sans engagement.');
    }
    if (/\b(horaire|ouvert|telephone|adresse|contact|joindre)\b/.test(question)) {
      return reponse('L’agence est ouverte du mardi au samedi, de 10 h à 19 h, au 12 rue des Écluses à Nantes. Téléphone : 02 40 00 00 00.');
    }
    if (outilsPermis && destination) return outil('chercher_prestations', { destination });
    return reponse('Nous organisons des week-ends insolites en train, au départ de Paris, à Nantes, Lyon et Lille. Quelle destination vous tente, à quelle date et à combien ?');
  }
}
