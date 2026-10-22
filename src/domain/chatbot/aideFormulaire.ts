/**
 * Le chatbot sur la page du formulaire de demande : il accompagne le client pour qu'il remplisse correctement la fiche.
 *
 * - Le navigateur envoie l'état du formulaire, réduit à des clés : les étapes encore vides et les champs en erreur.
 *   Aucune valeur saisie (ni nom, ni e-mail, ni dates, ni texte libre) ne part vers le serveur ni vers le modèle.
 * - L'étape « Alimentation et mobilité » n'en fait jamais partie : savoir qu'elle est cochée dirait quelque chose de
 *   la santé d'un voyageur.
 * - Les questions sur le formulaire (nuits, budget, envies, accords, ce qui manque…) reçoivent une réponse écrite par
 *   le code, à partir des mêmes règles que le formulaire (types/demande.ts) : instantanée, sans modèle.
 */
import { z } from 'zod';
import { LIMITES } from '../../../types/enums';
import { RETIRE } from './minimiser';

export const ETAPES_FORMULAIRE = ['vous', 'voyage', 'voyageurs', 'budget', 'envies', 'accords'] as const;
export type EtapeFormulaire = (typeof ETAPES_FORMULAIRE)[number];
const OBLIGATOIRES: readonly EtapeFormulaire[] = ['vous', 'voyage', 'voyageurs', 'accords'];

export const CHAMPS_FORMULAIRE = [
  'nom', 'email', 'date_debut', 'date_fin', 'nb_nuits', 'adultes', 'enfants', 'budget_euros', 'envies', 'contraintes', 'consentement_rgpd', 'consentement_ia',
] as const;
export type ChampFormulaire = (typeof CHAMPS_FORMULAIRE)[number];

/** Ce que le navigateur envoie du formulaire : des clés seulement, jamais une valeur. */
export const EtatFormulaire = z
  .object({
    manquantes: z.array(z.enum(ETAPES_FORMULAIRE)).max(ETAPES_FORMULAIRE.length),
    erreurs: z.array(z.enum(CHAMPS_FORMULAIRE)).max(CHAMPS_FORMULAIRE.length),
  })
  .strict();
export type EtatFormulaire = z.infer<typeof EtatFormulaire>;

const NOMS_ETAPES: Record<EtapeFormulaire, string> = {
  vous: 'Vous (nom et e-mail)',
  voyage: 'Votre voyage (départ, retour, nuits)',
  voyageurs: 'Les voyageurs',
  budget: 'Budget',
  envies: 'Vos envies',
  accords: 'Vos accords (les deux cases)',
};

/** Pour chaque champ en erreur : son nom à l'écran et la règle à respecter (les mêmes que reglesCroisees). */
const CONSEILS: Record<ChampFormulaire, string> = {
  nom: '« Nom et prénom » : indiquez au moins votre nom.',
  email: '« Adresse e-mail » : vérifiez-la, le conseiller vous répond à cette adresse.',
  date_debut: '« Départ » : une date à venir, pas une date passée.',
  date_fin: '« Retour » : une date qui suit le départ.',
  nb_nuits: `« Nombre de nuits » : pas plus de nuits que de jours entre départ et retour, ${LIMITES.nuitsMax} au plus.`,
  adultes: '« Adultes » : au moins un adulte voyage.',
  enfants: `« Enfants » : ${LIMITES.participantsMax} voyageurs au plus, adultes compris.`,
  budget_euros: '« Budget » : un montant en euros entiers, ou laissez-le vide.',
  envies: '« Ce qui vous ferait plaisir » : 2 000 caractères au plus.',
  contraintes: '« Ce qu’il faut éviter ou prévoir » : 2 000 caractères au plus.',
  consentement_rgpd: '« Vos accords » : la première case est nécessaire pour traiter votre demande.',
  consentement_ia: '« Vos accords » : la seconde case, sur l’usage de l’IA, est nécessaire.',
};

// sans accents, et l'apostrophe typographique ramenée à « ' » : « c’est bon ? » comme « c'est bon ? »
const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/’/g, "'").toLowerCase();
const liste = (mots: readonly string[]) => (mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}`);

/** Où en est le client : d'abord ce qui est en erreur, puis ce qui manque, sinon le feu vert. */
export function pointSurFormulaire(etat: EtatFormulaire): string {
  if (etat.erreurs.length > 0) {
    const [premier, ...autres] = etat.erreurs;
    return `${etat.erreurs.length === 1 ? 'Un champ est à corriger' : `${etat.erreurs.length} champs sont à corriger`}. ${CONSEILS[premier!]}${
      autres.length ? `\nEnsuite : ${autres.map((c) => CONSEILS[c]).join(' ')}` : ''
    }`;
  }
  const obligatoires = etat.manquantes.filter((e) => OBLIGATOIRES.includes(e));
  if (obligatoires.length > 0) return `Il vous reste à remplir : ${liste(obligatoires.map((e) => NOMS_ETAPES[e]))}. Le reste est facultatif.`;
  const facultatives = etat.manquantes.filter((e) => !OBLIGATOIRES.includes(e));
  return `Tout l’obligatoire est rempli : relisez votre billet, puis « Envoyer ma demande ».${
    facultatives.length ? `\n${liste(facultatives.map((e) => NOMS_ETAPES[e]))} : facultatif, mais cela aide le conseiller à viser juste.` : ''
  }`;
}

/**
 * Les questions sur le formulaire, de la plus précise à la plus large. Le texte arrive minimisé : une information de
 * santé y est déjà remplacée par sa marque, et on oriente vers les cases, sans jamais la reprendre.
 */
const QUESTIONS: [RegExp, (etat: EtatFormulaire) => string][] = [
  [
    new RegExp(`${plat(RETIRE.sante).replace(/[[\]]/g, '\\$&')}|\\b(regimes?|vegetari\\w*|vegan\\w*|vegetalien\\w*|gluten|mobilite|fauteuil|pmr|alimentation|sante)\\b`),
    () =>
      'Ne l’écrivez pas en texte libre : cochez la case qui convient dans « Alimentation et mobilité ». Le conseiller vous contactera pour les détails.\nEt ne me donnez ici aucune information de santé.',
  ],
  [
    /\b(manque\w*|il reste|reste a|fini|termine|complet|j'?en suis|bloqu\w*|erreurs?|en rouge|marche pas|peux pas envoyer|n'?arrive pas|c'?est bon)\b/,
    pointSurFormulaire,
  ],
  [
    /\b(nombre|combien|compter|calcul\w*|mettre)\s+(de\s+|les\s+)?nuits?\b|\bnuits?\s+(a|en)\s+(mettre|indiquer|compter)\b/,
    () =>
      `Comptez les nuits sur place : départ samedi, retour dimanche, c’est 1 nuit. Jamais plus de nuits que de jours entre les deux dates, ${LIMITES.nuitsMax} au plus ; 0 pour un aller-retour dans la journée.`,
  ],
  [
    /\b(dates?|depart|retour)\b/,
    () =>
      'Départ et retour : les jours du train aller et du train retour, au départ de Paris. Le départ ne peut pas être passé, le retour vient après.\nDates encore floues ? Mettez les plus probables et dites-le dans « Ce qu’il faut éviter ou prévoir ».',
  ],
  [
    /\bbudget\b/,
    () =>
      'Le budget est facultatif. C’est un total pour tout le groupe, en euros, transport compris : le conseiller compose le séjour dans cette enveloppe et vous envoie les prix vérifiés.',
  ],
  [
    /\b(enfants?|bebes?|ados?|adolescents?|ages?|adultes?)\b/,
    () =>
      `Dans « Enfants », comptez tous les voyageurs de moins de 18 ans ; dans « Adultes », les autres, au moins un. ${LIMITES.participantsMax} voyageurs au plus.`,
  ],
  [
    /\b(envies?|plaisir|eviter|prevoir|contraintes?|que (mettre|ecrire)|quoi (mettre|ecrire))\b/,
    () =>
      '« Ce qui vous ferait plaisir » : le rythme, les ambiances, ce qui vous tente (un atelier, une balade, la gastronomie…). « Ce qu’il faut éviter ou prévoir » : un horaire de train, une contrainte de dates, ce que vous ne voulez pas.\nPas d’information de santé dans ces deux cases : utilisez plutôt « Alimentation et mobilité ».',
  ],
  [
    /\b(pas d'?idee|aucune idee|sais pas ou|destination)\b/,
    () =>
      'Pas d’idée de destination ? Laissez le champ vide : le conseiller vous en proposera une. Nous partons à Nantes, Lyon et Lille ; une autre envie, écrivez-la.',
  ],
  [
    /\b(accords?|consentements?|rgpd|donnees|ia|intelligence artificielle|cocher|cases?)\b/,
    () =>
      'Les deux cases de « Vos accords » sont nécessaires. La première permet au conseiller d’utiliser votre demande pour préparer la proposition. La seconde : la demande est d’abord résumée par une IA, sans votre nom ni vos coordonnées, puis un conseiller la lit et valide tout.',
  ],
  [
    /\b(e-?mail|mail|nom|prenom|coordonnees|compte|inscri\w*)\b/,
    () =>
      'Pas de compte à créer. Votre nom et votre e-mail servent au conseiller pour vous répondre : écrivez-les directement dans « Vous », pas ici.',
  ],
  [
    /\b(apres l'?envoi|et apres|une fois envoye\w*|delai|qui (me )?repond\w*|quand (aurai|recevrai)\w*)\b/,
    () =>
      'Après l’envoi : une confirmation à l’écran, puis un conseiller lit votre demande et vous écrit par e-mail si un point est à préciser. Il vous envoie ensuite sa proposition, chaque prix vérifié.',
  ],
];

/** La réponse du code à une question sur le formulaire, ou null si la question porte sur autre chose (l'offre…). */
export function aideFormulaire(questionMinimisee: string, etat: EtatFormulaire): string | null {
  const q = plat(questionMinimisee);
  return QUESTIONS.find(([re]) => re.test(q))?.[1](etat) ?? null;
}

/** Les réponses rapides sur la page du formulaire : d'abord ce qui bloque, puis les questions les plus fréquentes. */
export function relancesFormulaire(etat: EtatFormulaire): string[] {
  const relances = ['Qu’est-ce qu’il me manque ?'];
  if (etat.manquantes.includes('voyage') || etat.erreurs.some((c) => c === 'nb_nuits' || c.startsWith('date_'))) relances.push('Combien de nuits mettre ?');
  if (etat.manquantes.includes('envies')) relances.push('Que mettre dans mes envies ?');
  if (relances.length < 3 && etat.manquantes.includes('budget')) relances.push('Le budget, c’est pour qui ?');
  if (relances.length < 3) relances.push('Que faire à Lyon ?');
  return relances.slice(0, 3);
}

/** Pour le modèle : la fiche et son état, en clés (aucune valeur saisie). */
export function consignesFormulaire(etat: EtatFormulaire): string {
  return [
    'Le visiteur est en train de remplir le formulaire de demande. Aide-le à le remplir correctement, en plus de répondre sur l’offre.',
    'Les étapes : Vous (nom, e-mail) ; Votre voyage (destination facultative, départ, retour, nombre de nuits) ; Les voyageurs (adultes, au moins un ; enfants de moins de 18 ans ; 20 au plus) ; Budget (facultatif, total du groupe en euros, transport compris) ; Vos envies (ce qui fait plaisir, ce qu’il faut éviter ou prévoir) ; Alimentation et mobilité (cases à cocher, facultatif) ; Vos accords (deux cases nécessaires).',
    'Une information de santé ne s’écrit jamais en texte libre : oriente vers les cases « Alimentation et mobilité », sans la reprendre.',
    `État du formulaire : étapes encore vides : ${etat.manquantes.join(', ') || 'aucune'} ; champs en erreur : ${etat.erreurs.join(', ') || 'aucun'}.`,
  ].join('\n');
}
