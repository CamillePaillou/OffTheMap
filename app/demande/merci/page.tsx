import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Saut } from '../../_composants/saut';
import { Ligne } from '../../_composants/ligne';
import { normaliserReference } from '@/src/domain/suiviClient';

export const metadata: Metadata = { title: 'Demande enregistrée' };

const SUITE = [
  { libelle: 'Demande envoyée', detail: 'C’est fait.' },
  { libelle: 'Un conseiller la lit', detail: 'Il vous écrit si un point est à préciser.' },
  { libelle: 'Prix vérifiés', detail: 'Auprès de chaque prestataire.' },
  { libelle: 'Proposition par mail', detail: 'Programme jour par jour et total.' },
];

// Confirmation après l'envoi d'une demande (E1.1), avec le numéro de dossier pour la suivre sans compte.
export default function MerciPage({ searchParams }: PageProps<'/demande/merci'>) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="panneau p-6 sm:p-10">
        <h1 className="text-4xl">
          Merci, c’est <Saut avant="n" apres="té" />.
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          Un conseiller DÉTOUR l’étudie et vous répond par e-mail. Pensez à regarder vos courriers indésirables si vous ne voyez rien venir.
        </p>
        <Suspense>
          <Numero searchParams={searchParams} />
        </Suspense>
        <div className="mt-10">
          <Ligne titre="Où en est votre demande" stations={SUITE} actuelle={1} />
        </div>
      </div>
      <p className="mt-6">
        <Link href="/" className="font-semibold underline underline-offset-4">
          Revenir à l’accueil
        </Link>
      </p>
    </main>
  );
}

async function Numero({ searchParams }: Pick<PageProps<'/demande/merci'>, 'searchParams'>) {
  const { dossier } = await searchParams;
  const reference = typeof dossier === 'string' ? normaliserReference(dossier) : null;
  if (!reference) return null;
  return (
    <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-ciel-pale p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <p className="text-sm font-medium">Votre numéro de dossier</p>
        <p className="mt-1 font-titre text-3xl font-extrabold tracking-[0.04em]">{reference}</p>
        <p className="mt-1 text-[15px] text-encre-doux">Notez-le : il suffit pour suivre votre demande, sans compte.</p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <Link href={`/suivi?numero=${reference}`} className="btn-principal">
          Suivre ma demande
        </Link>
        <Link href="/compte/inscription" className="text-[15px] underline underline-offset-4">
          Créer mon espace pour répondre en ligne
        </Link>
      </div>
    </div>
  );
}
