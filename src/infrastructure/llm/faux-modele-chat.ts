/**
 * Faux modèle du chatbot (E1.3) : déterministe, sans réseau ni clé. Utilisé quand `LLM_PROVIDER=fake` (le défaut),
 * pour que le chatbot réponde vraiment sans OpenRouter : il cherche dans le catalogue des prestataires (destination,
 * type, mots-clés comme « intérieur » ou « cuisine »), répond avec ce qu'il y trouve, puis vérifie une disponibilité
 * quand il a une date et un nombre de voyageurs. Il utilise les mêmes outils, bornés de la même façon, que le vrai
 * modèle. Il ne renvoie vers un conseiller que pour le prix, la réservation, ou ce que le catalogue ne dit pas.
 */
import { dateParlee } from '../../domain/chatbot/relances';
import type { ModeleAgent, ReponseChat, RequeteChat } from '../../ports/modele-agent';

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const NOMBRES: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function lireDestination(texte: string): string | null {
  const m = plat(texte).match(/\b(nantes|lyon|lille)\b/);
  return m ? m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1) : null;
}

/** Le jour existe-t-il ce mois-là, cette année-là ? (31 avril, 30 février, 29 février 2027 : non) */
const existe = (annee: number, mois: number, jour: number) =>
  mois >= 1 && mois <= 12 && jour >= 1 && new Date(Date.UTC(annee, mois - 1, jour)).getUTCDate() === jour;

/**
 * Une date dans le texte : `{ date }` en AAAA-MM-JJ si elle existe, `{ impossible }` (telle qu'écrite) si elle n'existe
 * pas au calendrier (« 32 octobre », « 31/02 »), null s'il n'y en a pas.
 */
function analyserDate(texte: string, aujourdhui: string): { date: string } | { impossible: string } | null {
  const t = plat(texte);
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return existe(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? { date: iso[0] } : { impossible: iso[0] };
  let jour: number;
  let mois: number;
  let ecrit: string;
  const enLettres = texte.match(/\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\b/i);
  const enChiffres = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (enLettres) [jour, mois, ecrit] = [Number(enLettres[1]), MOIS.indexOf(plat(enLettres[2]!)) + 1, `${Number(enLettres[1])} ${enLettres[2]!.toLowerCase()}`];
  else if (enChiffres) [jour, mois, ecrit] = [Number(enChiffres[1]), Number(enChiffres[2]), enChiffres[0]];
  else return null;
  let annee = Number(aujourdhui.slice(0, 4));
  const fmt = (a: number) => `${a}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
  if (fmt(annee) < aujourdhui) annee++;
  if (existe(annee, mois, jour)) return { date: fmt(annee) };
  // le 29 février n'existe que les années bissextiles : on dit de quelle année on parle
  return { impossible: existe(2028, mois, jour) ? `${ecrit} ${annee}` : ecrit };
}

/** « 7 novembre », « le 07/11 », « 2026-11-07 » → AAAA-MM-JJ, l'année étant la prochaine où la date n'est pas passée. */
export function lireDate(texte: string, aujourdhui: string): string | null {
  const d = analyserDate(texte, aujourdhui);
  return d && 'date' in d ? d.date : null;
}

/** « le 32 octobre », « le 31/02 » → la date telle qu'écrite, quand elle n'existe pas au calendrier. */
export function lireDateImpossible(texte: string, aujourdhui: string): string | null {
  const d = analyserDate(texte, aujourdhui);
  return d && 'impossible' in d ? d.impossible : null;
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

/** « oublie les dates », « sans date », « peu importe la date » : la date d'avant ne compte plus. */
export function oublieLesDates(texte: string): boolean {
  return /\b(oubli\w*|laisse\w*|ignore\w*)\s+(les\s+|la\s+)?dates?\b|\bsans\s+dates?\b|\bpeu\s+importe\s+(les\s+|la\s+)?dates?\b|\bpas\s+de\s+dates?\b/.test(plat(texte));
}

/** Réponse fixe d'une vérification impossible (MESSAGES_FIXES.nonVerifie) : la redemander telle quelle ne sert à rien. */
const VERIFICATION_ECHOUEE = /rien de verifie/;

type TypePrestation = 'transport' | 'hebergement' | 'activite';

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

/** « 3 adresses », « une adresse » */
const adresses = (n: number) => (n === 1 ? 'une adresse' : `${n} adresses`);
const NOMS_MOTS: Record<string, string> = { intérieur: 'en intérieur', extérieur: 'en plein air', cuisine: 'gourmande', créatif: 'créative', jeu: 'pour jouer', 'sans effort': 'sans effort', 'centre-ville': 'en centre-ville', 'sans voiture': 'sans voiture' };

/**
 * Réponse courte : les prestations s'affichent en cartes sous la bulle (nom, ville, type, description). Le texte
 * dit seulement ce qu'on a trouvé, puis ce qu'on peut faire ensuite.
 */
function resumer(prestations: readonly PrestationLue[], mots: string | undefined, destination: string | undefined): string {
  const villes = [...new Set(prestations.map((p) => p.destination))];
  const ou = destination ? ` à ${destination}` : villes.length === 1 ? ` à ${villes[0]}` : ` à ${villes.slice(0, -1).join(', ')} et ${villes.at(-1)}`;
  const quoi = mots ? mots.split(' ').map((m) => NOMS_MOTS[m] ?? m).join(', ') : '';
  return `${adresses(prestations.length).replace(/^./, (c) => c.toUpperCase())}${quoi ? ` ${quoi}` : ''}${ou}, chez nos partenaires.`;
}

/** Ce que le modèle de règles sait traiter seul ; le reste va au vrai modèle quand il est configuré. */
export function comprendQuestion(texte: string, aujourdhui: string): boolean {
  const t = plat(texte);
  return (
    !!lireDestination(texte) || !!lireType(texte) || !!lireMots(texte) || !!analyserDate(texte, aujourdhui) ||
    /\b(reserv\w*|prix|combien|tarifs?|couts?|coute|budget|horaires?|ouvert\w*|telephone|adresse|contact|agence|propose\w*|offre|catalogue|destinations?|villes?)\b/.test(t) ||
    /^(bonjour|salut|bonsoir|hello|coucou)\W*$/.test(t.trim())
  );
}

/**
 * Messages du visiteur qui comptent encore pour la date : ceux qui suivent la dernière vérification
 * échouée (réponse de l'assistant) ou le dernier « oublie les dates » (message du visiteur, exclu lui-même).
 */
export function visiteurDepuisDerniereRemiseAZero(msgs: RequeteChat['messages']): string[] {
  let debut = 0;
  msgs.forEach((m, i) => {
    const texte = plat(String(m.content ?? ''));
    if ((m.role === 'assistant' && VERIFICATION_ECHOUEE.test(texte)) || (m.role === 'user' && oublieLesDates(texte))) debut = i + 1;
  });
  return msgs.slice(debut).filter((m) => m.role === 'user').map((m) => String(m.content));
}

export class FauxModeleChat implements ModeleAgent {
  async appeler(requete: RequeteChat): Promise<ReponseChat> {
    const msgs = requete.messages;
    const outilsPermis = requete.tools.length > 0;
    const aujourdhui = /Aujourd’hui : (\d{4}-\d{2}-\d{2})/.exec(String(msgs[0]?.content))?.[1] ?? new Date().toISOString().slice(0, 10);
    const visiteur = msgs.filter((m) => m.role === 'user').map((m) => String(m.content));
    const dernierVisiteur = visiteur.at(-1) ?? '';
    // ce que le visiteur a dit le plus récemment : il peut donner la date dans un message et la ville dans un autre,
    // et changer de ville en cours de route (« Et à Lyon ? » puis « Que faire à Nantes ? » : c'est Nantes qui compte)
    const plusRecent = <T>(textes: readonly string[], lire: (t: string) => T | null): T | null =>
      [...textes].reverse().map(lire).find((v) => v !== null && v !== undefined) ?? null;
    const dernier = msgs.at(-1)!;
    const reponse = (content: string): ReponseChat => ({ modele: 'faux-modele-chat', message: { content } });
    const outil = (name: string, args: object): ReponseChat => ({
      modele: 'faux-modele-chat',
      message: { content: null, tool_calls: [{ id: `faux-${msgs.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    });

    // la ville, le type et les mots-clés de la dernière question d'abord, sinon ceux de la conversation
    const destination = plusRecent(visiteur, lireDestination);
    const type = lireType(dernierVisiteur) ?? (lireDestination(dernierVisiteur) ? null : plusRecent(visiteur, lireType));
    const motsCles = lireMots(dernierVisiteur);
    // la date du dernier message d'abord (« Et le 14 novembre ? »), sinon la plus récente d'avant, mais pas une date
    // donnée avant une vérification qui a échoué ni avant « oublie les dates » : sans cela, chaque nouvelle question
    // relançait la même vérification impossible et le chatbot répondait en boucle « rien de vérifié ».
    // Le nombre de voyageurs, lui, reste : ce n'est pas lui qui a fait échouer la vérification.
    const date = plusRecent(visiteurDepuisDerniereRemiseAZero(msgs), (v) => lireDate(v, aujourdhui));
    const voyageurs = plusRecent(visiteur, lireVoyageurs);

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
        const trouve = motsCles && !args.mots
          ? `Rien de tel${args.destination ? ` à ${args.destination}` : ''} pour l’instant. ${resumer(prestations, undefined, args.destination)}`
          : resumer(prestations, args.mots, args.destination);
        const ensuite = args.destination
          ? 'Donnez-moi une date et le nombre de voyageurs : je vérifie si c’est libre.'
          : 'Une ville vous tente ? Avec une date, je vérifie si c’est libre.';
        return reponse(`${trouve}\n${ensuite}`);
      }
      if (typeof resultat.disponible === 'boolean') {
        const nom = typeof resultat.nom === 'string' ? resultat.nom : 'Cette prestation';
        const jourSemaine = new Date(`${resultat.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
        const quand = `${jourSemaine} ${dateParlee(String(resultat.date))}`;
        const qui = `${resultat.participants} personne${Number(resultat.participants) > 1 ? 's' : ''}`;
        return reponse(
          resultat.disponible
            ? `C’est libre : ${nom}, le ${quand}, pour ${qui}. Vérifié à l’instant auprès du prestataire.\nPour le prix et le reste du séjour, un conseiller vous envoie une proposition signée.`
            : `${nom} est complet le ${quand} pour ${qui}.\nUne autre date, ou une autre idée dans la même ville ?`,
        );
      }
      if (typeof resultat.erreur === 'string') return reponse('Je n’ai pas trouvé cette prestation au catalogue. Dites-moi la ville et ce qui vous tente, je cherche.');
      return reponse('Je n’ai pas pu vérifier cela. Composez votre week-end : un conseiller vérifiera pour vous.');
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
    // « Et le 32 octobre ? » : ni vérification à une date qui n'existe pas, ni réponse à côté de la question
    const impossible = lireDateImpossible(dernierVisiteur, aujourdhui);
    if (impossible) {
      return reponse(`Le ${impossible} n’existe pas au calendrier. Quelle date voulez-vous ? Je vérifie si c’est libre.`);
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
    return reponse('Je n’ai pas pu chercher dans le catalogue. Composez votre week-end : un conseiller vous répondra par e-mail.');
  }
}
