'use server';

import { redirect } from 'next/navigation';
import { genererEnArrierePlan } from '@/lib/fiche/generation';
import { corrigerDemande } from '@/src/application/corrigerDemande';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { LIBELLES_CHAMPS } from '@/types/correction';
import { lireSaisie, valeursSaisies } from '../../lecture';
import type { EtatDemande } from '../../actions';

const LIEN_INVALIDE = 'Ce lien n’est plus valable : la demande a déjà été corrigée, ou le lien a expiré. Contactez votre conseiller.';

function aujourdhuiParis() {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/** Liée au jeton par la page (bind) : le jeton ne transite pas par un champ du formulaire. */
export async function envoyerCorrection(jeton: string, _etat: EtatDemande, formulaire: FormData): Promise<EtatDemande> {
  const valeurs = valeursSaisies(formulaire);
  let resultat;
  try {
    resultat = await corrigerDemande(new CorrectionsSupabase(), jeton, lireSaisie(formulaire), aujourdhuiParis(), {
      confirmeInchanges: formulaire.get('confirmer_inchanges') === 'on',
    });
  } catch {
    return { erreurs: { formulaire: 'Votre correction n’a pas pu être enregistrée. Réessayez dans un instant.' }, valeurs };
  }
  if (resultat.ok) {
    genererEnArrierePlan(resultat.dossierId, 'deja_en_cours'); // E2.2 : fiche de la nouvelle version
    redirect('/demande/corriger/merci');
  }
  if ('lien' in resultat) return { erreurs: { formulaire: LIEN_INVALIDE }, valeurs };
  if ('inchanges' in resultat) return { inchanges: resultat.inchanges.map((c) => LIBELLES_CHAMPS[c]), valeurs };
  return { erreurs: resultat.erreurs, valeurs };
}
