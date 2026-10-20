'use client';

import { useActionState } from 'react';
import { poser, type EtatAccord } from './actions';

export function BoutonOption(props: { propositionId: string; ligneId: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(poser, {});
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <button type="submit" disabled={enCours} className="self-start rounded-lg bg-nuit hover:bg-[#0a3a57] px-4 py-2 text-sm text-white disabled:opacity-60">
        {enCours ? 'Pose de l’option…' : 'Poser l’option'}
      </button>
      {etat.erreur && <p role="alert" className="text-sm text-red-700">{etat.erreur}</p>}
      {etat.ok && <p role="status" className="text-sm text-green-800">Option posée. L’expiration affichée provient de la réponse du simulateur.</p>}
    </form>
  );
}
