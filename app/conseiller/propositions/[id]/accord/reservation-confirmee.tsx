'use client';

import { useCallback } from 'react';
import { Monogramme } from '@/app/_composants/logo';

/** Posé par le bouton « Confirmer la réservation » : le O ne se clique que juste après le geste du conseiller. */
export const cleConfirmation = (ligneId: string) => `detour-confirmation-${ligneId}`;

/**
 * Réservation confirmée (brand kit, « Produit ») : c'est ici que le O se clique. Le saut se joue une fois, quand le
 * conseiller vient de confirmer ; à la relecture de la page, le monogramme reste posé. Jamais déclenché par l'agent.
 * Un seul O par écran : le monogramme n'accompagne que la dernière réservation confirmée (`monogramme`).
 */
export function ReservationConfirmee({
  ligneId,
  reservation,
  prix,
  par,
  monogramme,
}: {
  ligneId: string;
  reservation: string;
  /** Prix revérifié et sa date, déjà formatés : « 96,00 € le 21/10 à 16:38 ». */
  prix: string | null;
  par: string;
  monogramme: boolean;
}) {
  // lu une seule fois, au montage : la marque posée par le bouton est aussitôt retirée
  const vientDEtreConfirmee = useCallback(() => {
    try {
      if (!sessionStorage.getItem(cleConfirmation(ligneId))) return false;
      sessionStorage.removeItem(cleConfirmation(ligneId));
      return true;
    } catch {
      return false; // stockage indisponible : pas de saut, la confirmation reste affichée
    }
  }, [ligneId]);

  return (
    <div role="status" className="mt-4 flex flex-col gap-3 rounded-2xl bg-craie p-5">
      <div className="flex justify-between gap-3 border-b border-trait pb-2.5 text-[15px]">
        <span>Réservation {reservation}</span>
        {prix && <span>Prix revérifié <b className="font-titre font-extrabold">{prix}</b></span>}
      </div>
      <p className="flex items-center gap-3 font-titre text-[22px] font-extrabold leading-tight tracking-[-0.025em]">
        {monogramme && <Monogramme saute={vientDEtreConfirmee} pastille className="size-14 shrink-0" />}
        Réservation confirmée par {par}
      </p>
    </div>
  );
}
