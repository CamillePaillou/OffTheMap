/**
 * Contrat du formulaire de demande (E1.1) : ce que le client saisit, validé côté serveur avant tout enregistrement.
 * Chaque champ a un usage (docs/specs/formulaire-demande.md) : un champ sans usage n'est pas demandé.
 * Le budget est GLOBAL, pour tout le groupe (docs/specs/chiffrage.md) ; il est saisi en euros et stocké en centimes.
 */
import { z } from 'zod';
import { LIMITES, MOBILITES, REGIMES, type TrancheAge } from './enums';

const texteOptionnel = (max: number) =>
  z.string().trim().max(max, `${max} caractères maximum`).transform((t) => (t === '' ? null : t)).nullable();

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide');
const nombre = (message: string) => z.number({ message }).int(message).min(0, message).max(LIMITES.participantsMax, `${LIMITES.participantsMax} maximum`);

/** Saisie du formulaire, après lecture de FormData. `aujourdhui` permet de refuser une date passée (AAAA-MM-JJ). */
export const schemaSaisieDemande = (aujourdhui: string) =>
  z
    .object({
      nom: z.string().trim().min(1, 'Indiquez votre nom').max(120, '120 caractères maximum'),
      email: z.email('Adresse e-mail invalide'),
      destination: texteOptionnel(120),
      date_debut: date,
      date_fin: date,
      nb_nuits: z.number({ message: 'Indiquez le nombre de nuits' }).int().min(0, 'Nombre de nuits invalide').max(LIMITES.nuitsMax, `${LIMITES.nuitsMax} nuits maximum`),
      adultes: nombre('Nombre d’adultes invalide'),
      enfants: nombre('Nombre d’enfants invalide'),
      budget_euros: z.number().int('Budget en euros entiers').positive('Le budget doit être positif').max(1_000_000).nullable(),
      envies: texteOptionnel(2000),
      contraintes: texteOptionnel(2000),
      regimes: z.array(z.enum(REGIMES)),
      mobilite: z.enum(MOBILITES).nullable(),
      // prestations ajoutées depuis le chatbot (E1.4) : identifiants du catalogue ; la base ne garde que les actives
      prestations: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/, 'Prestation inconnue')).max(6, '6 prestations au plus').default([]),
      // Vérifiés dans superRefine avec les règles croisées : toutes les erreurs s'affichent en une fois.
      consentement_rgpd: z.boolean(),
      consentement_ia: z.boolean(),
    })
    .superRefine((d, ctx) => {
      if (!d.consentement_rgpd) ctx.addIssue({ code: 'custom', path: ['consentement_rgpd'], message: 'Votre accord est nécessaire pour traiter votre demande' });
      if (!d.consentement_ia) ctx.addIssue({ code: 'custom', path: ['consentement_ia'], message: 'Votre accord sur l’usage de l’IA est nécessaire' });
      if (d.date_debut < aujourdhui) ctx.addIssue({ code: 'custom', path: ['date_debut'], message: 'La date de départ est passée' });
      if (d.date_fin < d.date_debut) ctx.addIssue({ code: 'custom', path: ['date_fin'], message: 'La date de retour précède le départ' });
      const jours = (Date.parse(d.date_fin) - Date.parse(d.date_debut)) / 86_400_000;
      if (d.nb_nuits > jours) ctx.addIssue({ code: 'custom', path: ['nb_nuits'], message: 'Plus de nuits que de jours entre les deux dates' });
      if (d.adultes < 1) ctx.addIssue({ code: 'custom', path: ['adultes'], message: 'Au moins un adulte voyage' });
      if (d.adultes + d.enfants > LIMITES.participantsMax) ctx.addIssue({ code: 'custom', path: ['enfants'], message: `${LIMITES.participantsMax} voyageurs maximum` });
    });

export type SaisieDemande = z.infer<ReturnType<typeof schemaSaisieDemande>>;

/** Ligne prête pour deposer_demande (colonnes de la table demandes). */
export interface NouvelleDemande {
  consentement_rgpd: true;
  consentement_ia: true;
  nom: string;
  email: string;
  destination: string | null;
  date_debut: string;
  date_fin: string;
  nb_nuits: number;
  voyageurs: TrancheAge[];
  budget_annonce_cents: number | null;
  envies: string | null;
  contraintes: string | null;
  regimes: SaisieDemande['regimes'];
  mobilite: SaisieDemande['mobilite'];
  prestations_souhaitees: string[];
}

/** À n'appeler qu'après une validation réussie : les deux consentements y sont vrais. */
export function versNouvelleDemande(s: SaisieDemande): NouvelleDemande {
  return {
    consentement_rgpd: true,
    consentement_ia: true,
    nom: s.nom,
    email: s.email,
    destination: s.destination,
    date_debut: s.date_debut,
    date_fin: s.date_fin,
    nb_nuits: s.nb_nuits,
    voyageurs: [...Array<TrancheAge>(s.adultes).fill('adulte'), ...Array<TrancheAge>(s.enfants).fill('enfant')],
    budget_annonce_cents: s.budget_euros === null ? null : s.budget_euros * 100,
    envies: s.envies,
    contraintes: s.contraintes,
    regimes: s.regimes,
    mobilite: s.mobilite,
    prestations_souhaitees: [...new Set(s.prestations)],
  };
}
