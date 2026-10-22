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

// Préremplissage depuis une carte de l'accueil (« Un week-end à Lyon ») ou depuis le chatbot (E1.3) : destination,
// date de départ, nombre d'adultes et la prestation choisie dans le chatbot (« envie »), contrôlés ici ; le client
// relit et complète. Rien d'autre n'est prérempli.
async function AvecDestination({ searchParams }: Pick<PageProps<'/demande'>, 'searchParams'>) {
  const p = await searchParams;
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const destination = texte(p.destination).slice(0, 80);
  const date = texte(p.date_debut);
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? date : '';
  const adultes = Number(texte(p.adultes));
  const adultesValides = Number.isInteger(adultes) && adultes >= 1 && adultes <= 20 ? String(adultes) : '';
  // nom d'une prestation du catalogue : lettres, chiffres et ponctuation simple seulement, 120 caractères au plus
  const envie = texte(p.envie).replace(/[^\p{L}\p{N} ’'.,:()–-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const initiales: Record<string, string> = {};
  if (envie) initiales.envies = `Ce qui me tente : ${envie}.`;
  if (destination) initiales.destination = destination;
  if (dateValide) initiales.date_debut = dateValide;
  if (destination || dateValide || adultesValides || envie) Object.assign(initiales, { adultes: adultesValides || '2', enfants: '0' });
  return <FormulaireDemande initiales={Object.keys(initiales).length ? initiales : undefined} />;
}
