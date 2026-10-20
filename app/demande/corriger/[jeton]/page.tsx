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

const COMMENTAIRE_PAR_DEFAUT = 'Merci de vérifier ce point.';

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
  // E3.3 : chaque champ surligné a une explication ; sans commentaire du conseiller, une phrase par défaut
  const commentaires = Object.fromEntries(lecture.champs.map((c) => [c, lecture.commentaires[c] ?? COMMENTAIRE_PAR_DEFAUT]));
  const expire = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(lecture.expireLe));
  return (
    <>
      <section id="points-a-revoir" className="mt-6 rounded border border-amber-400 bg-amber-50 px-4 py-4 text-amber-900">
        <h2 className="font-medium">Pourquoi votre conseiller vous recontacte</h2>
        <p className="mt-2 whitespace-pre-line text-sm">{lecture.motif}</p>
        <h3 className="mt-4 text-sm font-medium">Les points à revoir</h3>
        <ul className="mt-1 list-inside list-disc text-sm">
          {lecture.champs.map((c) => (
            <li key={c}>
              {LIBELLES_CHAMPS[c]}
              {lecture.commentaires[c] && <span> : {lecture.commentaires[c]}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="comment-faire" className="mt-4 text-sm text-zinc-700">
        <h2 id="comment-faire" className="font-medium text-zinc-900">Comment faire</h2>
        <ol className="mt-1 list-inside list-decimal">
          <li>Modifiez les champs surlignés : l’explication de votre conseiller est juste en dessous. Vous pouvez aussi changer le reste.</li>
          <li>Si une information signalée est exacte telle quelle, vous pourrez le confirmer au moment de l’envoi.</li>
          <li>Envoyez : votre conseiller reprend votre demande et vous répond par e-mail.</li>
        </ol>
        <p className="mt-2 text-zinc-600">Ce lien ne sert qu’une fois et reste valable jusqu’au {expire}.</p>
      </section>
      <FormulaireDemande
        action={envoyerCorrection.bind(null, jeton)}
        initiales={versValeursFormulaire(lecture.demande)}
        surlignes={surlignes}
        commentaires={commentaires}
        libelleEnvoi="Envoyer ma correction"
      />
    </>
  );
}
