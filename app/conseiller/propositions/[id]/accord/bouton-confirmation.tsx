'use client';

import { useActionState, useEffect } from 'react';
import { confirmer, type EtatAccord } from './actions';
import { cleConfirmation } from './reservation-confirmee';

/**
 * La clé n'est envoyée qu'à l'action serveur, jamais au modèle ni à la trace (ni gardée dans le navigateur).
 * L'envoi marque la ligne pour que le O se clique à l'affichage de la réservation confirmée.
 */
export function BoutonConfirmation(props: { propositionId: string; ligneId: string }) {
  const [etat, action, enCours] = useActionState<EtatAccord, FormData>(confirmer, {});
  // confirmation refusée : la marque est retirée, le O ne sautera pas
  useEffect(() => {
    if (!etat.erreur) return;
    try {
      sessionStorage.removeItem(cleConfirmation(props.ligneId));
    } catch {
      // stockage indisponible : rien à retirer
    }
  }, [etat.erreur, props.ligneId]);
  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          sessionStorage.setItem(cleConfirmation(props.ligneId), '1');
        } catch {
          // sans stockage : pas de saut, rien d'autre ne change
        }
      }}
      className="mt-4 flex flex-col items-start gap-2"
    >
      <input type="hidden" name="propositionId" value={props.propositionId} />
      <input type="hidden" name="ligneId" value={props.ligneId} />
      <label htmlFor={`cle-${props.ligneId}`} className="text-sm font-semibold">Seconde validation : clé d’approbation</label>
      <input id={`cle-${props.ligneId}`} name="cleApprobation" type="password" autoComplete="off" required maxLength={500}
        className="bo-champ w-full max-w-sm text-sm" />
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Confirmation…' : 'Confirmer la réservation'}
      </button>
      {etat.erreur && <p role="alert" className="text-sm text-brique-texte">{etat.erreur}</p>}
      {etat.ok && <p role="status" className="text-sm text-encre">Réservation confirmée.</p>}
    </form>
  );
}
