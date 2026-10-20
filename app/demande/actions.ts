'use server';

import { redirect } from 'next/navigation';
import { deposerDemande, type ErreursChamps } from '@/src/application/deposerDemande';
import { DemandesSupabase } from '@/src/infrastructure/db/demandesSupabase';
import { lireSaisie, valeursSaisies } from './lecture';

export interface EtatDemande {
  erreurs?: ErreursChamps;
  valeurs?: Record<string, string>;
  /** Correction (E1.2) : libellés des points signalés renvoyés sans changement. */
  inchanges?: string[];
}

/** Date du jour à Paris, AAAA-MM-JJ : une date de départ antérieure est refusée. */
function aujourdhuiParis() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

export async function envoyerDemande(_etat: EtatDemande, formulaire: FormData): Promise<EtatDemande> {
  let resultat;
  try {
    resultat = await deposerDemande(new DemandesSupabase(), lireSaisie(formulaire), aujourdhuiParis());
  } catch {
    return {
      erreurs: { formulaire: 'Votre demande n’a pas pu être enregistrée. Réessayez dans un instant.' },
      valeurs: valeursSaisies(formulaire),
    };
  }
  if (!resultat.ok) return { erreurs: resultat.erreurs, valeurs: valeursSaisies(formulaire) };
  redirect('/demande/merci');
}
