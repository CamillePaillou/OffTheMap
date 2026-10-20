import type { Metadata } from 'next';
import Link from 'next/link';
import { Ligne } from '../../../_composants/ligne';

export const metadata: Metadata = { title: 'Correction enregistrée' };

const SUITE = [
  { libelle: 'Demande envoyée' },
  { libelle: 'Correction envoyée', detail: 'C’est fait.' },
  { libelle: 'Le conseiller reprend la demande', detail: 'Avec vos précisions.' },
  { libelle: 'Proposition par mail', detail: 'Programme jour par jour et total.' },
];

// Confirmation après l'envoi d'une correction (E1.2).
export default function MerciCorrectionPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="panneau p-6 sm:p-10">
        <h1 className="text-4xl">Merci, votre correction est enregistrée</h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">Votre conseiller reprend votre demande et vous répond par e-mail.</p>
        <div className="mt-10">
          <Ligne titre="Où en est votre demande" stations={SUITE} actuelle={2} />
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
