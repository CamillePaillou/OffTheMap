'use client';

import { useActionState } from 'react';
import { reverifier, type EtatReverification } from './actions';

/** L'agent peut prendre jusqu'à trois tours : le bouton reste désactivé pendant la vérification. */
export function BoutonReverifier({ propositionId, ligneId, deja }: { propositionId: string; ligneId: string; deja: boolean }) {
  const [etat, action, enCours] = useActionState<EtatReverification, FormData>(() => reverifier(propositionId, ligneId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={enCours} className="rounded-lg border border-doux px-4 py-2 disabled:opacity-50">
        {enCours ? 'Vérification en cours…' : deja ? 'Revérifier' : 'Vérifier le prix'}
      </button>
      {enCours && <span className="text-sm text-doux">L’agent interroge le prestataire, cela peut prendre une minute.</span>}
      {etat.erreur && !enCours && (
        <span role="alert" className="text-sm text-red-700">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}
