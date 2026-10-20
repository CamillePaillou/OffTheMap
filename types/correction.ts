/**
 * Correction d'une demande depuis un lien (E1.2). Spécification : docs/specs/correction-demande.md.
 *
 * Le conseiller choisit les points à revoir ; le client reçoit un lien à usage unique, valable 7 jours, qui ouvre
 * le formulaire prérempli avec ces points surlignés. Le renvoi crée la version suivante de la demande.
 * Deux boucles au plus par dossier.
 */
import { z } from 'zod';
import type { NouvelleDemande } from './demande';
import { REGIMES } from './enums';

/** Points que le conseiller peut demander de revoir, au niveau de la demande (pas du champ HTML). */
export const CHAMPS_CORRIGEABLES = [
  'email',
  'destination',
  'dates',
  'nb_nuits',
  'voyageurs',
  'budget',
  'envies',
  'contraintes',
  'regimes',
  'mobilite',
] as const;
export type ChampCorrigeable = (typeof CHAMPS_CORRIGEABLES)[number];

export const LIBELLES_CHAMPS: Record<ChampCorrigeable, string> = {
  email: 'Adresse e-mail',
  destination: 'Destination',
  dates: 'Dates du séjour',
  nb_nuits: 'Nombre de nuits',
  voyageurs: 'Voyageurs',
  budget: 'Budget',
  envies: 'Ce qui vous ferait plaisir',
  contraintes: 'Ce qu’il faut éviter ou prévoir',
  regimes: 'Alimentation',
  mobilite: 'Mobilité',
};

/**
 * Motifs types par point (E3.3) : suggestions proposées au conseiller pour le petit commentaire, qu'il peut garder,
 * compléter ou remplacer. Formulés pour le client : ils disent pourquoi le champ ne va pas et quoi faire.
 */
export const MOTIFS_TYPES: Record<ChampCorrigeable, readonly string[]> = {
  email: ['Notre message est revenu : pouvez-vous vérifier votre adresse ?'],
  destination: [
    'Nous ne proposons pas encore cette destination : pouvez-vous en indiquer une autre ?',
    'Indiquez une ville ou une région : nous construisons le séjour autour.',
  ],
  dates: [
    'Ces dates sont trop proches pour organiser le séjour : pouvez-vous les décaler ?',
    'Les dates de départ et de retour ne correspondent pas au nombre de nuits.',
    'Ces dates tombent sur une période complète : avez-vous d’autres dates possibles ?',
  ],
  nb_nuits: [
    'Le nombre de nuits ne correspond pas aux dates indiquées.',
    'Une nuit de plus permettrait un programme moins serré : est-ce possible ?',
  ],
  voyageurs: [
    'Pouvez-vous confirmer le nombre d’adultes et d’enfants ?',
    'Au-delà de 20 voyageurs, nous organisons le séjour autrement : contactez-nous.',
  ],
  budget: [
    'Le budget est trop court pour le transport et l’hébergement de tout le groupe : pouvez-vous le revoir ?',
    'Le budget indiqué est-il pour tout le groupe ou par personne ? Nous attendons le total pour le groupe.',
  ],
  envies: [
    'Pouvez-vous préciser ce qui vous ferait plaisir : visites, ateliers, nature, gastronomie… ?',
    'Ces envies sont difficiles à réunir en un seul séjour : lesquelles comptent le plus ?',
  ],
  contraintes: ['Pouvez-vous préciser cette contrainte, pour que nous en tenions compte ?'],
  regimes: ['Pouvez-vous préciser le régime alimentaire concerné ?'],
  mobilite: ['Pouvez-vous nous dire si un voyageur a besoin d’un accès adapté ?'],
};

/** Champs du formulaire (attribut name) surlignés pour chaque point. */
export const CHAMPS_FORMULAIRE: Record<ChampCorrigeable, readonly string[]> = {
  email: ['email'],
  destination: ['destination'],
  dates: ['date_debut', 'date_fin'],
  nb_nuits: ['nb_nuits'],
  voyageurs: ['adultes', 'enfants'],
  budget: ['budget_euros'],
  envies: ['envies'],
  contraintes: ['contraintes'],
  regimes: REGIMES.map((r) => `regime_${r}`),
  mobilite: ['mobilite_reduite'],
};

export const REGLES_CORRECTION = {
  bouclesMax: 2, // au-delà, le conseiller appelle le client ou refuse le dossier
  dureeLienJours: 7,
  motifMax: 500,
  commentaireMax: 200, // petit commentaire du conseiller, affiché sous le champ concerné
} as const;

export type Commentaires = Partial<Record<ChampCorrigeable, string>>;

/** Ce que le conseiller envoie pour demander une correction. Le motif est lu par le client : rien d'interne. */
export const schemaDemandeCorrection = z.object({
  champs: z
    .array(z.enum(CHAMPS_CORRIGEABLES))
    .min(1, 'Choisissez au moins un point à corriger')
    .transform((c) => [...new Set(c)]),
  motif: z
    .string()
    .trim()
    .min(1, 'Expliquez au client ce qu’il doit revoir')
    .max(REGLES_CORRECTION.motifMax, `${REGLES_CORRECTION.motifMax} caractères maximum`),
  /** Facultatif : un petit commentaire par point signalé, lu par le client sous le champ. Les vides sont ignorés. */
  commentaires: z
    .partialRecord(
      z.enum(CHAMPS_CORRIGEABLES),
      z.string().trim().max(REGLES_CORRECTION.commentaireMax, `${REGLES_CORRECTION.commentaireMax} caractères maximum par commentaire`),
    )
    .default({})
    .transform((c): Commentaires => Object.fromEntries(Object.entries(c).filter(([, v]) => v)) as Commentaires),
}).superRefine((d, ctx) => {
  for (const point of Object.keys(d.commentaires))
    if (!d.champs.includes(point as ChampCorrigeable))
      ctx.addIssue({ code: 'custom', path: ['commentaires'], message: 'Un commentaire ne peut porter que sur un point à corriger' });
});
export type DemandeCorrection = z.infer<typeof schemaDemandeCorrection>;

/** Jeton du lien : 32 octets aléatoires en base64url. Seule son empreinte SHA-256 est stockée. */
export const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

type Comparable = Omit<NouvelleDemande, 'consentement_rgpd' | 'consentement_ia'>;

/** Valeur d'un point, mise en forme pour comparer deux versions (ordre et casse sans importance). */
export function valeurDuPoint(d: Comparable, c: ChampCorrigeable): string {
  switch (c) {
    case 'email':
      return d.email.trim().toLowerCase();
    case 'destination':
      return (d.destination ?? '').trim().toLowerCase();
    case 'dates':
      return `${d.date_debut}/${d.date_fin}`;
    case 'nb_nuits':
      return String(d.nb_nuits);
    case 'voyageurs':
      return [...d.voyageurs].sort().join(',');
    case 'budget':
      return String(d.budget_annonce_cents ?? '');
    case 'envies':
      return (d.envies ?? '').trim();
    case 'contraintes':
      return (d.contraintes ?? '').trim();
    case 'regimes':
      return [...d.regimes].sort().join(',');
    case 'mobilite':
      return d.mobilite === 'reduite' ? 'reduite' : ''; // « aucune » et vide disent la même chose
  }
}

/** Points signalés que le client a renvoyés sans les modifier. */
export function pointsInchanges(avant: Comparable, apres: Comparable, points: readonly ChampCorrigeable[]): ChampCorrigeable[] {
  return points.filter((c) => valeurDuPoint(avant, c) === valeurDuPoint(apres, c));
}

/** Préremplit le formulaire avec une version de la demande. Les consentements sont redemandés. */
export function versValeursFormulaire(d: Comparable): Record<string, string> {
  const enfants = d.voyageurs.filter((v) => v !== 'adulte').length;
  const valeurs: Record<string, string> = {
    nom: d.nom,
    email: d.email,
    destination: d.destination ?? '',
    date_debut: d.date_debut,
    date_fin: d.date_fin,
    nb_nuits: String(d.nb_nuits),
    adultes: String(d.voyageurs.length - enfants),
    enfants: String(enfants),
    budget_euros: d.budget_annonce_cents === null ? '' : String(d.budget_annonce_cents / 100),
    envies: d.envies ?? '',
    contraintes: d.contraintes ?? '',
  };
  for (const r of d.regimes) valeurs[`regime_${r}`] = 'on';
  if (d.mobilite === 'reduite') valeurs.mobilite_reduite = 'on';
  return valeurs;
}
