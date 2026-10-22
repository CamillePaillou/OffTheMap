'use client';

import { useActionState } from 'react';
import { annuler, type EtatAccord } from './actions';

/** E9.8 : la clé n'est envoyée qu'à l'action serveur, jamais au modèle ni à la trace. */
export function BoutonAnnulation(props: { propositionId: string; ligneId: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(annuler, {});
  return (
    <form action={action} className="mt-4 flex flex-col items-start gap-2 border-t border-encre-doux/20 pt-4">
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <p className="text-sm font-semibold">Annuler cette réservation (libère les places)</p>
      <label htmlFor={`cle-annulation-${props.ligneId}`} className="text-sm">Clé d’approbation</label>
      <input id={`cle-annulation-${props.ligneId}`} name="cleApprobation" type="password" autoComplete="off" required maxLength={500}
        className="bo-champ w-full max-w-sm text-sm" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirme" required />
        Je confirme vouloir annuler cette réservation confirmée.
      </label>
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Annulation…' : 'Annuler la réservation'}
      </button>
      {etat.erreur && <p role="alert" className="text-sm text-brique-texte">{etat.erreur}</p>}
      {etat.ok && <p role="status" className="text-sm text-encre">Réservation annulée par le simulateur. Les places sont libérées.</p>}
    </form>
  );
}
