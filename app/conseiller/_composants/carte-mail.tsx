'use client';

import { useActionState } from 'react';
import { marquerEnvoye, type EtatMail } from './mails';

interface Props {
  dossierId: string;
  propositionId: string | null;
  modele: 'rendez_vous' | 'a_corriger' | 'proposition' | 'confirmation';
  titre: string;
  sujet: string;
  corps: string;
  mailto: string;
  /** Lien vers la version imprimable (proposition), pour l'enregistrer en PDF et la joindre. */
  imprimer?: string;
  /** Ouvert d'emblée (mail à envoyer tout de suite). */
  ouvert?: boolean;
}

/** Mail modèle (E5.4) : aperçu, ouverture dans la messagerie, puis « marquer comme envoyé » (journal). */
export function CarteMail({ dossierId, propositionId, modele, titre, sujet, corps, mailto, imprimer, ouvert = false }: Props) {
  const [etat, action, enCours] = useActionState<EtatMail, FormData>(() => marquerEnvoye(dossierId, propositionId, modele), {});
  return (
    <details open={ouvert} className="rounded border border-zinc-200 bg-white p-4">
      <summary className="cursor-pointer font-medium">{titre}</summary>
      <div className="mt-3 rounded bg-zinc-50 p-3">
        <p className="text-xs text-zinc-500">Aperçu : relisez et complétez dans votre messagerie avant d’envoyer</p>
        <p className="mt-1 font-medium">{sujet}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{corps}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={mailto} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white">
          Ouvrir dans ma messagerie
        </a>
        {imprimer && (
          <a href={imprimer} target="_blank" rel="noopener" className="rounded border border-zinc-300 px-4 py-2 text-sm">
            Version imprimable (PDF)
          </a>
        )}
        <form action={action}>
          <button type="submit" disabled={enCours || etat.envoye} className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50">
            {etat.envoye ? 'Marqué envoyé' : 'Marquer comme envoyé'}
          </button>
        </form>
      </div>
      {etat.erreur && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {etat.erreur}
        </p>
      )}
    </details>
  );
}
