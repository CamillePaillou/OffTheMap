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
    <details open={ouvert} className={`bo-carte group p-4 ${etat.envoye ? 'ring-2 ring-ciel-pale' : ''}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-encre [&::-webkit-details-marker]:hidden">
        <span>{titre}</span>
        <span className="text-sm font-normal text-encre-doux">
          {etat.envoye ? 'envoyé' : <span className="group-open:hidden">voir</span>}
          {!etat.envoye && <span className="hidden group-open:inline">fermer</span>}
        </span>
      </summary>
      <div className="mt-3 overflow-hidden rounded-[14px] border border-trait">
        <p className="border-b border-trait bg-craie px-3 py-2 text-sm">
          <span className="text-encre-doux">Objet : </span>
          <span className="font-semibold">{sujet}</span>
        </p>
        <p className="max-h-72 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-sm leading-relaxed text-encre">{corps}</p>
      </div>
      <p className="mt-2 text-xs text-encre-doux">Relisez et complétez dans votre messagerie avant d’envoyer.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={mailto} className="bo-btn text-sm">
          Ouvrir dans ma messagerie
        </a>
        {imprimer && (
          <a href={imprimer} target="_blank" rel="noopener" className="bo-btn-2 text-sm">
            Version imprimable (PDF)
          </a>
        )}
        <form action={action}>
          <button type="submit" disabled={enCours || etat.envoye} className="bo-btn-2 text-sm disabled:text-encre! disabled:opacity-100!">
            {etat.envoye ? '✓ Marqué envoyé' : 'Marquer comme envoyé'}
          </button>
        </form>
      </div>
      {etat.erreur && (
        <p role="alert" className="mt-2 text-sm text-brique-texte">
          {etat.erreur}
        </p>
      )}
    </details>
  );
}
