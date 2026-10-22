'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { relancerBrouillonAction } from './actions';

/** Pendant la génération, la page se recharge toutes les 3 secondes jusqu'au brouillon (ou à l'erreur). */
export function RafraichirPendantGeneration() {
  const router = useRouter();
  useEffect(() => {
    const minuteur = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(minuteur);
  }, [router]);
  return null;
}

export function BoutonRelancerBrouillon({ propositionId }: { propositionId: string }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => relancerBrouillonAction(propositionId), {});
  return (
    <form action={action} className="flex items-center gap-4">
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Relance…' : 'Relancer'}
      </button>
      {etat.erreur && (
        <span role="alert" className="text-sm text-brique-texte">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}
