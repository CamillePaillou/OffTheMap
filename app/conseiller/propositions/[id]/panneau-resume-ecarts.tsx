'use client';

import { useActionState } from 'react';
import { rediger, type EtatResume } from './resume-ecarts';

/**
 * Résumé des écarts en mots (E6.3), sans aucun chiffre : le conseiller le reprend dans sa réponse et y ajoute les prix.
 * `aJour` vaut faux si les écarts ont changé depuis l'écriture du résumé (tarifs confirmés, ligne remplacée…).
 */
export function PanneauResumeEcarts({ propositionId, resume, aJour }: { propositionId: string; resume: string | null; aJour: boolean }) {
  const [etat, action, enCours] = useActionState<EtatResume, FormData>(() => rediger(propositionId), {});
  return (
    <div className="mt-5 border-t border-trait pt-4">
      <h3 className="font-semibold text-encre">Résumé pour le client</h3>
      {resume ? (
        <>
          <blockquote className="mt-2 whitespace-pre-line rounded-lg bg-brume p-3 text-sm text-encre">{resume}</blockquote>
          <p className={`mt-1 text-xs ${aJour ? 'text-ardoise' : 'font-semibold text-[#5c3d0c]'}`}>
            {aJour
              ? 'Écrit par l’IA, sans aucun chiffre : ajoutez les prix vous-même avant de l’envoyer.'
              : 'Les écarts ont changé depuis ce résumé : rédigez-le à nouveau.'}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ardoise">
          L’IA rédige un court paragraphe qui explique ces changements au client, sans aucun chiffre ni montant.
        </p>
      )}
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={enCours} className="bo-btn-2 text-sm">
          {enCours ? 'Rédaction…' : resume ? 'Rédiger à nouveau' : 'Rédiger le résumé pour le client'}
        </button>
        {etat.erreur && !enCours && (
          <span role="alert" className="text-sm text-grenade">
            {etat.erreur}
          </span>
        )}
      </form>
    </div>
  );
}
