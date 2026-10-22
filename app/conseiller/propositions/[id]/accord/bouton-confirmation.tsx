'use client';

import { useActionState } from 'react';
import { confirmer, type EtatAccord } from './actions';

/** La clé n'est envoyée qu'à l'action serveur, jamais au modèle ni à la trace. */
export function BoutonConfirmation(props: { propositionId: string; ligneId: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(confirmer, {});
  return (
    <form action={action} className="mt-4 flex flex-col items-start gap-2">
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <label htmlFor={`cle-${props.ligneId}`} className="text-sm font-semibold">Seconde validation : clé d’approbation</label>
      <input id={`cle-${props.ligneId}`} name="cleApprobation" type="password" autoComplete="off" required maxLength={500}
        className="bo-champ w-full max-w-sm text-sm" />
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Confirmation…' : 'Confirmer la réservation'}
      </button>
      {etat.erreur && <p role="alert" className="text-sm text-grenade">{etat.erreur}</p>}
      {etat.ok && <p role="status" className="text-sm text-sauge">Réservation confirmée par le simulateur.</p>}
    </form>
  );
}
