'use client';

import { useActionState } from 'react';
import { autoriser, type EtatAccord } from './actions';

export function BoutonAccord(props: { propositionId: string; ligneId: string; prixAfficheCents: number; prixAffiche: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(autoriser, {});

  return (
    <form action={action} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <input type="hidden" name="prixAfficheCents" value={props.prixAfficheCents} />
      <button type="submit" disabled={enCours} className="bo-btn self-start">
        {enCours ? 'Enregistrement…' : `Autoriser cette prestation à ${props.prixAffiche}`}
      </button>
      {etat.erreur && (
        <p role="alert" className="text-sm text-grenade">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
