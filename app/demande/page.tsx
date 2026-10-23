import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Saut } from '../_composants/saut';
import { nommerPrestations } from '@/src/infrastructure/db/catalogueSupabase';
import { clientConnecte } from '@/lib/auth/client';
import { FormulaireDemande } from './formulaire';

export const metadata: Metadata = { title: 'Composer mon week-end' };

// Page publique du formulaire de demande (E1.1) : sans compte, le client décrit son voyage.
export default function DemandePage({ searchParams }: PageProps<'/demande'>) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="max-w-2xl">
        <h1 className="text-4xl sm:text-5xl">
          <Saut avant="C" apres="mposez" /> votre week-end
        </h1>
        <p className="mt-3 text-lg leading-relaxed">
          Cinq minutes, sans compte. Un conseiller compose votre séjour, vérifie chaque prix avec l’heure et vous l’envoie signé de son
          prénom.
        </p>
      </div>
      <Suspense fallback={<FormulaireDemande />}>
        <AvecDestination searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Préremplissage depuis une carte de l'accueil (« Un week-end à Lyon ») ou depuis le chatbot (E1.3) : destination,
// date de départ, nombre d'adultes, et les prestations ajoutées dans le chatbot (E1.4, « prestations=id1,id2 »),
// contrôlées ici et nommées depuis le catalogue ; le client relit, retire ou complète. Client connecté : son adresse.
async function AvecDestination({ searchParams }: Pick<PageProps<'/demande'>, 'searchParams'>) {
  const p = await searchParams;
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const destination = texte(p.destination).slice(0, 80);
  const date = texte(p.date_debut);
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? date : '';
  const adultes = Number(texte(p.adultes));
  const adultesValides = Number.isInteger(adultes) && adultes >= 1 && adultes <= 20 ? String(adultes) : '';
  const prestations = await nommerPrestations(texte(p.prestations).split(','));
  const initiales: Record<string, string> = {};
  if (destination) initiales.destination = destination;
  if (dateValide) initiales.date_debut = dateValide;
  if (destination || dateValide || adultesValides || prestations.length) Object.assign(initiales, { adultes: adultesValides || '2', enfants: '0' });
  // sans destination donnée, celle des prestations choisies si elles sont toutes dans la même ville
  const villes = [...new Set(prestations.map((x) => x.destination))];
  if (!initiales.destination && villes.length === 1) initiales.destination = villes[0]!;
  // espace client : l'adresse confirmée du compte, celle qui relie la demande à l'espace (le client peut la changer)
  const client = await clientConnecte();
  if (client?.confirme) initiales.email = client.email;
  return <FormulaireDemande initiales={Object.keys(initiales).length ? initiales : undefined} prestationsChoisies={prestations} />;
}
