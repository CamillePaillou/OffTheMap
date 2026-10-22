import type { Metadata } from 'next';
import Link from 'next/link';
import { Saut } from '../../_composants/saut';
import { Ligne } from '../../_composants/ligne';

export const metadata: Metadata = { title: 'Demande enregistrée' };

const SUITE = [
  { libelle: 'Demande envoyée', detail: 'C’est fait.' },
  { libelle: 'Un conseiller la lit', detail: 'Il vous écrit si un point est à préciser.' },
  { libelle: 'Prix vérifiés', detail: 'Auprès de chaque prestataire.' },
  { libelle: 'Proposition par mail', detail: 'Programme jour par jour et total.' },
];

// Confirmation après l'envoi d'une demande (E1.1).
export default function MerciPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <div className="panneau p-6 sm:p-10">
        <h1 className="text-4xl">
          Merci, c’est <Saut avant="n" apres="té" />.
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed">
          Un conseiller DÉTOUR l’étudie et vous répond par e-mail. Pensez à regarder vos courriers indésirables si vous ne voyez rien venir.
        </p>
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
