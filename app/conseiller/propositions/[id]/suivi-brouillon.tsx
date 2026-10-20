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
      <button type="submit" disabled={enCours} className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
        {enCours ? 'Relance…' : 'Relancer'}
      </button>
      {etat.erreur && (
        <span role="alert" className="text-sm text-red-700">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}
