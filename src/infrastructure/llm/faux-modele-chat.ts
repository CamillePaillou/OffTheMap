/**
 * Faux modèle du chatbot (E1.3) : déterministe, sans réseau ni clé. Utilisé quand `LLM_PROVIDER=fake` (le défaut),
 * pour que le chatbot réponde vraiment sans OpenRouter : il cherche dans le catalogue des prestataires (destination,
 * type, mots-clés comme « intérieur » ou « cuisine »), répond avec ce qu'il y trouve, puis vérifie une disponibilité
 * quand il a une date et un nombre de voyageurs. Il utilise les mêmes outils, bornés de la même façon, que le vrai
 * modèle. Il ne renvoie vers un conseiller que pour le prix, la réservation, ou ce que le catalogue ne dit pas.
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
type TypePrestation = keyof typeof NOMS_TYPES;

/** « un hôtel », « où dormir » → hebergement ; « que faire », « un atelier » → activite ; « le train » → transport. */
export function lireType(texte: string): TypePrestation | null {
  const t = plat(texte);
  if (/\b(hotels?|dormir|nuits?|heberg\w*|loger|logement|chambres?)\b/.test(t)) return 'hebergement';
  if (/\b(activites?|faire|ateliers?|visites?|jeux?|sorties?|decouv\w*|occuper)\b/.test(t)) return 'activite';
  if (/\b(trains?|transports?|trajets?|venir|aller-retour|gare)\b/.test(t)) return 'transport';
  return null;
}

/** Mots-clés reconnus, ramenés aux mots du catalogue (« quand il pleut » → intérieur). */
const MOTS_CLES: [RegExp, string][] = [
  [/\b(pluie|pleut|interieur|au chaud|couvert)\b/, 'intérieur'],
  [/\b(exterieur|plein air|dehors|balade|marcher)\b/, 'extérieur'],
  [/\b(cuisine|culinaire|gourmand\w*|manger|gaufres?)\b/, 'cuisine'],
  [/\b(creati\w*|bricol\w*|machines?)\b/, 'créatif'],
  [/\b(jeu|jeux|enquete|piste|traboules?)\b/, 'jeu'],
  [/\b(sans effort|calme|tranquille|sans sport|mobilite reduite)\b/, 'sans effort'],
  [/\b(centre|centre-ville)\b/, 'centre-ville'],
  [/\b(sans voiture)\b/, 'sans voiture'],
];

export function lireMots(texte: string): string | null {
  const t = plat(texte);
  const trouves = MOTS_CLES.filter(([re]) => re.test(t)).map(([, mot]) => mot);
  return trouves.length > 0 ? [...new Set(trouves)].join(' ') : null;
}

interface PrestationLue {
  id: string;
  nom: string;
  type: TypePrestation;
  destination: string;
  description?: string;
  tags?: string[];
}

/** « Atelier de machines imaginaires (activité, créatif, intérieur) : atelier accessible sans effort sportif. » */
function decrire(p: PrestationLue): string {
  const etiquettes = [NOMS_TYPES[p.type] ?? p.type, ...(p.tags ?? [])].join(', ');
  const description = p.description?.replace(/\bfictif\b|\bfictive\b/g, '').replace(/\s+/g, ' ').trim();
  return `${p.nom} (${etiquettes})${description ? ` : ${description.charAt(0).toLowerCase()}${description.slice(1)}` : ''}`;
}

/** Les prestations regroupées par ville, une ville par ligne (sans le nom de la ville quand il n'y en a qu'une). */
function parVille(prestations: readonly PrestationLue[]): string {
  const villes = [...new Set(prestations.map((p) => p.destination))];
  if (villes.length === 1) return prestations.map((p) => `- ${decrire(p)}.`).join('\n');
  return villes
    .map((v) => `${v} : ${prestations.filter((p) => p.destination === v).map(decrire).join(' ; ')}.`)
    .join('\n');
}

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

    // la ville, le type et les mots-clés de la dernière question d'abord, sinon ceux de la conversation
    const destination = lireDestination(dernierVisiteur) ?? lireDestination(toutVisiteur);
    const type = lireType(dernierVisiteur) ?? (lireDestination(dernierVisiteur) ? null : lireType(toutVisiteur));
    const motsCles = lireMots(dernierVisiteur);
    const date = lireDate(toutVisiteur, aujourdhui);
    const voyageurs = lireVoyageurs(toutVisiteur);

    if (dernier.role === 'tool') {
      const resultat = JSON.parse(dernier.content) as Record<string, unknown>;
      if (Array.isArray(resultat.prestations)) {
        const prestations = resultat.prestations as PrestationLue[];
        // arguments de la recherche qui vient d'être faite
        const precedent = [...msgs].reverse().find((m) => m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0);
        const appel = precedent?.role === 'assistant' ? precedent.tool_calls?.[0] : undefined;
        const args = JSON.parse(appel?.function.arguments ?? '{}') as { destination?: string; type?: string; mots?: string };
        if (prestations.length === 0) {
          // rien avec ces mots-clés : on montre ce qui existe quand même
          if (outilsPermis && args.mots) return outil('chercher_prestations', { ...(args.destination ? { destination: args.destination } : {}) });
          return reponse(`Nos partenaires ne proposent rien de tel${args.destination ? ` à ${args.destination}` : ''} pour l’instant. Nous travaillons à Nantes, Lyon et Lille : laquelle vous tente ?`);
        }
        // une date et un nombre de voyageurs : on vérifie la prestation qui répond le mieux à la question
        if (outilsPermis && date && voyageurs) {
          const cible = (type && prestations.find((p) => p.type === type)) || prestations.find((p) => p.type === 'activite') || prestations[0]!;
          return outil('verifier_disponibilite', { prestation_id: cible.id, date, participants: voyageurs });
        }
        const intro = args.mots
          ? `Ce qui correspond à « ${args.mots} » :`
          : motsCles
            ? `Rien ne correspond exactement à « ${motsCles} »${args.destination ? ` à ${args.destination}` : ''}. Voici ce que nos partenaires y proposent :`
            : `Voici ce que nos partenaires proposent${args.destination ? ` à ${args.destination}` : ''} :`;
        const relance = args.destination
          ? 'Donnez-moi une date et le nombre de voyageurs : je vérifie si c’est libre.'
          : 'Une ville vous tente ? Donnez-moi aussi une date et le nombre de voyageurs : je vérifie si c’est libre.';
        return reponse(`${intro}\n${parVille(prestations)}\n${relance}`);
      }
      if (typeof resultat.disponible === 'boolean') {
        const nom = typeof resultat.nom === 'string' ? resultat.nom : 'Cette prestation';
        const quand = new Date(`${resultat.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
        const qui = `${resultat.participants} personne${Number(resultat.participants) > 1 ? 's' : ''}`;
        return reponse(
          resultat.disponible
            ? `C’est libre : ${nom}, le ${quand}, pour ${qui}. Vérifié à l’instant auprès du prestataire. Pour le prix et le reste du séjour, décrivez votre week-end : un conseiller vous envoie une proposition signée, avec des prix vérifiés.`
            : `${nom} est complet le ${quand} pour ${qui}. Une autre date, ou une autre idée dans la même ville ? Dites-moi.`,
        );
      }
      if (typeof resultat.erreur === 'string') return reponse('Je n’ai pas trouvé cette prestation au catalogue. Dites-moi la ville et ce qui vous tente, je cherche.');
      return reponse('Je n’ai pas pu vérifier cela. Décrivez votre week-end : un conseiller vérifiera pour vous.');
    }

    const question = plat(dernierVisiteur);
    if (/\b(reserv\w*|book\w*|bloque\w*|confirm\w*)\b/.test(question)) {
      return reponse('Je ne réserve rien moi-même : un conseiller compose votre séjour, vérifie chaque prix et confirme les réservations après votre accord. Je peux en revanche vous dire ce qu’on propose et si c’est libre à une date.');
    }
    if (/\b(prix|combien|tarifs?|couts?|coute|budget|cher)\b/.test(question)) {
      return reponse('Je ne donne pas de prix : un conseiller vérifie chaque tarif auprès des prestataires, avec l’heure, et vous l’envoie dans une proposition signée. En attendant, je peux vous dire ce qu’on propose et si c’est libre à une date.');
    }
    if (/\b(horaires?|ouvert\w*|telephone|adresse|contact|joindre|agence)\b/.test(question)) {
      return reponse('L’agence est ouverte du mardi au samedi, de 10 h à 19 h, au 12 rue des Écluses à Nantes. Téléphone : 02 40 00 00 00.');
    }
    if (/^(bonjour|salut|bonsoir|hello|coucou)\W*$/.test(question.trim())) {
      return reponse('Bonjour ! Je connais le catalogue de nos partenaires à Nantes, Lyon et Lille, et je peux vérifier si une activité ou un hôtel est libre à une date. Que cherchez-vous ?');
    }
    // tout le reste : on cherche dans le catalogue, avec ce qu'on a compris de la question
    if (outilsPermis) {
      return outil('chercher_prestations', {
        ...(destination ? { destination } : {}),
        ...(type ? { type } : {}),
        ...(motsCles ? { mots: motsCles } : {}),
      });
    }
    return reponse('Je n’ai pas pu chercher dans le catalogue. Décrivez votre week-end : un conseiller vous répondra par e-mail.');
  }
}
