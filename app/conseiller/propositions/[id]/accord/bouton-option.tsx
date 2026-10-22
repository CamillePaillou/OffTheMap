'use client';

import { useActionState } from 'react';
import { poser, type EtatAccord } from './actions';

export function BoutonOption(props: { propositionId: string; ligneId: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(poser, {});
  return (
    <form action={action} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <button type="submit" disabled={enCours} className="bo-btn self-start">
        {enCours ? 'Pose de l’option…' : 'Poser l’option'}
      </button>
      {etat.erreur && <p role="alert" className="text-sm text-brique-texte">{etat.erreur}</p>}
      {etat.ok && <p role="status" className="text-sm text-encre">Option posée. L’expiration affichée est celle donnée par le prestataire.</p>}
    </form>
  );
}
