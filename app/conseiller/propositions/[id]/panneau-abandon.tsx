'use client';

import { useActionState } from 'react';
import { abandonner, type EtatAbandon } from './abandon';

/** Abandon proposé à J+14 sans réponse du client (E6.5). Repliable : relancer ou enregistrer la réponse reste possible. */
export function PanneauAbandon({ propositionId }: { propositionId: string }) {
  const [etat, action, enCours] = useActionState<EtatAbandon, FormData>(
    (e: EtatAbandon, f: FormData) => abandonner(propositionId, e, f),
    {},
  );
  return (
    <details className="bo-carte p-5" open={etat.erreur !== undefined}>
      <summary className="cursor-pointer font-semibold text-encre">Abandonner le dossier</summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <p className="text-sm text-ardoise">
          Le dossier est clos et sort des clients à relancer. La proposition reste telle qu’elle a été envoyée.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input name="confirmer" type="checkbox" />
          Le client n’a pas répondu malgré les relances
        </label>
        <button type="submit" disabled={enCours} className="bo-btn-2 self-start text-sm">
          {enCours ? 'Abandon…' : 'Abandonner le dossier'}
        </button>
        {etat.erreur && (
          <p role="alert" className="text-sm text-grenade">
            {etat.erreur}
          </p>
        )}
      </form>
    </details>
  );
}
