'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { StatutProposition } from '@/types';
import { repondre, type EtatReponse } from './reponse';

const ETAPES = {
  acceptee: {
    titre: 'Le client accepte la proposition',
    case: 'Le client m’a confirmé son acceptation (mail ou téléphone)',
    bouton: 'Enregistrer l’acceptation',
  },
  depot_recu: {
    titre: 'Dépôt de garantie',
    case: 'J’ai vérifié la réception du dépôt de garantie',
    bouton: 'Enregistrer le dépôt reçu',
  },
} as const;

/** Réponse du client (E7.1) : acceptation, puis dépôt reçu ; ensuite, la réservation (accord pour les options). */
export function PanneauReponse({ propositionId, statut }: { propositionId: string; statut: StatutProposition }) {
  const etape = statut === 'envoyee' || statut === 'sans_reponse' ? 'acceptee' : statut === 'acceptee' ? 'depot_recu' : null;
  const [etat, action, enCours] = useActionState<EtatReponse, FormData>(
    (e: EtatReponse, f: FormData) => repondre(propositionId, etape ?? 'acceptee', e, f),
    {},
  );

  if (statut === 'depot_recu') {
    return (
      <section className="rounded-[18px] bg-sauge-pale p-4 text-sm">
        <p className="font-medium text-sauge">Proposition acceptée, dépôt de garantie reçu.</p>
        <Link href={`/conseiller/propositions/${propositionId}/accord`} className="mt-2 inline-block underline underline-offset-4">
          Passer à la réservation : donner l’accord pour les options
        </Link>
      </section>
    );
  }
  if (!etape) return null;
  const t = ETAPES[etape];
  return (
    <form action={action} className="bo-carte flex flex-col gap-3 p-5">
      <h2 className="text-xl">{t.titre}</h2>
      {etape === 'depot_recu' && <p className="text-sm text-sauge">Acceptation enregistrée.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input name="confirmer" type="checkbox" />
        {t.case}
      </label>
      <button type="submit" disabled={enCours} className="bo-btn self-start">
        {enCours ? 'Enregistrement…' : t.bouton}
      </button>
      {etat.erreur && (
        <p role="alert" className="text-sm text-grenade">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
