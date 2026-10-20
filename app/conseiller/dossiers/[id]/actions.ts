'use server';

import { refresh } from 'next/cache';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { genererEnArrierePlan } from '@/lib/fiche/generation';
import { corrigerFiche, type ErreursChamps } from '@/src/application/corrigerFiche';
import { relancerFiche } from '@/src/application/relancerFiche';
import { FichesSupabase } from '@/src/infrastructure/db/fichesSupabase';
import { StatutsSupabase } from '@/src/infrastructure/db/statutsSupabase';

export interface EtatCorrection {
  erreurs?: ErreursChamps;
  valeurs?: Record<string, string>; // saisie à remettre dans le formulaire après une erreur
  enregistre?: boolean;
}

const texte = (f: FormData, nom: string) => (f.get(nom)?.toString() ?? '').trim();
const ouNull = (v: string) => (v === '' ? null : v);
const entier = (f: FormData, nom: string) => {
  const v = texte(f, nom);
  return v === '' ? null : Number(v);
};
const CHAMPS = ['budget_reel_euros', 'date_debut_fixe', 'date_fin_fixe', 'nb_nuits_fixe', 'notes_conseiller'] as const;
const valeursSaisies = (f: FormData) => Object.fromEntries(CHAMPS.map((c) => [c, f.get(c)?.toString() ?? '']));

/** Correction après l'entretien : budget réel, dates fixes, notes (E2.1). */
export async function enregistrerCorrection(dossierId: string, _etat: EtatCorrection, f: FormData): Promise<EtatCorrection> {
  await exigerConseiller(`/conseiller/dossiers/${dossierId}`);
  const saisie = {
    budget_reel_euros: entier(f, 'budget_reel_euros'),
    date_debut_fixe: ouNull(texte(f, 'date_debut_fixe')),
    date_fin_fixe: ouNull(texte(f, 'date_fin_fixe')),
    nb_nuits_fixe: entier(f, 'nb_nuits_fixe'),
    notes_conseiller: texte(f, 'notes_conseiller'),
  };
  let resultat;
  try {
    resultat = await corrigerFiche(new FichesSupabase(), dossierId, saisie);
  } catch {
    return { erreurs: { formulaire: 'La correction n’a pas pu être enregistrée. Réessayez dans un instant.' }, valeurs: valeursSaisies(f) };
  }
  if (!resultat.ok) return { erreurs: resultat.erreurs, valeurs: valeursSaisies(f) };
  refresh();
  return { enregistre: true };
}

/** Bouton « relancer » d'une fiche en erreur. */
export async function relancer(dossierId: string): Promise<{ erreur?: string }> {
  const conseiller = await exigerConseiller(`/conseiller/dossiers/${dossierId}`);
  const resultat = await relancerFiche(new StatutsSupabase(), dossierId, conseiller.id);
  if (!resultat.ok) {
    return { erreur: resultat.raison === 'statut_modifie' ? 'Le dossier a changé entre-temps : rechargez la page.' : 'Cette fiche ne peut pas être relancée.' };
  }
  genererEnArrierePlan(dossierId, 'deja_en_cours'); // E2.2 : le dossier est en fiche_en_cours, la génération repart
  refresh();
  return {};
}
