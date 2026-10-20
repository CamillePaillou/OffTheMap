import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FormulaireDemande } from './formulaire';

export const metadata: Metadata = { title: 'Décrire mon week-end' };

// Page publique du formulaire de demande (E1.1) : sans compte, le client décrit son voyage.
export default function DemandePage({ searchParams }: PageProps<'/demande'>) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-4xl">Décrivez votre week-end</h1>
        <p className="mt-3 text-lg leading-relaxed">
          Quelques informations suffisent : un conseiller DÉTOUR s’occupe du reste et vous envoie une proposition sur mesure, avec des prix
          vérifiés.
        </p>
      </div>
      <Suspense fallback={<FormulaireDemande />}>
        <AvecDestination searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Depuis une carte de l'accueil (« Un week-end à Lyon ») : la destination est préremplie, rien d'autre.
async function AvecDestination({ searchParams }: Pick<PageProps<'/demande'>, 'searchParams'>) {
  const { destination } = await searchParams;
  const valeur = typeof destination === 'string' ? destination.trim().slice(0, 80) : '';
  return <FormulaireDemande initiales={valeur ? { destination: valeur, adultes: '2', enfants: '0' } : undefined} />;
}
