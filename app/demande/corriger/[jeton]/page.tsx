import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { lireCorrection } from '@/src/application/corrigerDemande';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { CHAMPS_FORMULAIRE, LIBELLES_CHAMPS, versValeursFormulaire } from '@/types/correction';
import { FormulaireDemande } from '../../formulaire';
import { envoyerCorrection } from './actions';

// Le jeton est dans l'adresse : elle ne doit fuiter ni vers un autre site (Referer) ni dans un moteur de recherche.
export const metadata: Metadata = {
  title: 'Corriger ma demande',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

// Page publique de correction (E1.2) : ouverte depuis le lien envoyé par le conseiller, sans compte.
export default function CorrigerPage({ params }: PageProps<'/demande/corriger/[jeton]'>) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Corriger ma demande</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-600">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

const MESSAGES = {
  inconnu: 'Ce lien n’est pas valable. Vérifiez qu’il est complet, ou contactez votre conseiller.',
  utilise: 'Votre correction a déjà été envoyée. Votre conseiller l’étudie et vous recontacte.',
  expire: 'Ce lien a expiré. Contactez votre conseiller : il vous en enverra un nouveau si nécessaire.',
  clos: 'Votre demande n’attend plus de correction. Votre conseiller vous recontacte.',
} as const;

async function Contenu({ params }: { params: PageProps<'/demande/corriger/[jeton]'>['params'] }) {
  await connection(); // lu à chaque requête : jamais mis en cache ni prérendu
  const { jeton } = await params;
  const lecture = await lireCorrection(new CorrectionsSupabase(), jeton);
  if (lecture.etat !== 'valide') return <p className="mt-4 text-zinc-600">{MESSAGES[lecture.etat]}</p>;

  const surlignes = lecture.champs.flatMap((c) => CHAMPS_FORMULAIRE[c]);
  const expire = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(lecture.expireLe));
  return (
    <>
      <section id="points-a-revoir" className="mt-6 rounded border border-amber-400 bg-amber-50 px-4 py-3 text-amber-900">
        <h2 className="font-medium">Votre conseiller vous demande de revoir :</h2>
        <ul className="mt-2 list-inside list-disc text-sm">
          {lecture.champs.map((c) => (
            <li key={c}>
              {LIBELLES_CHAMPS[c]}
              {lecture.commentaires[c] && <span> : {lecture.commentaires[c]}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 whitespace-pre-line text-sm">{lecture.motif}</p>
      </section>
      <p className="mt-4 text-sm text-zinc-600">
        Les champs concernés sont surlignés, avec l’explication de votre conseiller. Vous pouvez aussi modifier le reste. Ce lien ne sert qu’une fois et reste valable
        jusqu’au {expire}.
      </p>
      <FormulaireDemande
        action={envoyerCorrection.bind(null, jeton)}
        initiales={versValeursFormulaire(lecture.demande)}
        surlignes={surlignes}
        commentaires={lecture.commentaires}
        libelleEnvoi="Envoyer ma correction"
      />
    </>
  );
}
