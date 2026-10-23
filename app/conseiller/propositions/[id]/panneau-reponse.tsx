'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { StatutProposition } from '@/types';
import { AValider, ZONE_A_VALIDER } from '../../_composants/a-valider';
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
export function PanneauReponse({ propositionId, statut, aValider = false }: { propositionId: string; statut: StatutProposition; aValider?: boolean }) {
  const etape = statut === 'envoyee' || statut === 'sans_reponse' ? 'acceptee' : statut === 'acceptee' ? 'depot_recu' : null;
  const [etat, action, enCours] = useActionState<EtatReponse, FormData>(
    (e: EtatReponse, f: FormData) => repondre(propositionId, etape ?? 'acceptee', e, f),
    {},
  );

  if (statut === 'reservee') {
    return (
      <section className="rounded-[18px] bg-ciel-pale p-4 text-sm">
        <p className="font-medium text-encre">Toutes les prestations sont réservées.</p>
        <Link href={`/conseiller/propositions/${propositionId}/accord`} className="mt-2 inline-block underline underline-offset-4">
          Voir les réservations
        </Link>
      </section>
    );
  }
  if (statut === 'depot_recu') {
    return (
      <section id="reponse" className={`rounded-[18px] bg-ciel-pale p-4 text-sm ${aValider ? ZONE_A_VALIDER : ''}`}>
        {aValider && <AValider />}
        <p className={`font-medium text-encre ${aValider ? 'mt-2' : ''}`}>Proposition acceptée, dépôt de garantie reçu.</p>
        <Link href={`/conseiller/propositions/${propositionId}/accord`} className="mt-2 inline-block underline underline-offset-4">
          Passer à la réservation : donner l’accord pour les options
        </Link>
      </section>
    );
  }
  if (!etape) return null;
  const t = ETAPES[etape];
  return (
    <form id="reponse" action={action} className={`bo-carte flex flex-col gap-3 p-5 ${aValider ? ZONE_A_VALIDER : 'scroll-mt-6'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl">{t.titre}</h2>
        {aValider && <AValider />}
      </div>
      {etape === 'depot_recu' && <p className="text-sm text-encre">Acceptation enregistrée.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input name="confirmer" type="checkbox" />
        {t.case}
      </label>
      <button type="submit" disabled={enCours} className="bo-btn self-start">
        {enCours ? 'Enregistrement…' : t.bouton}
      </button>
      {etat.erreur && (
        <p role="alert" className="text-sm text-brique-texte">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
