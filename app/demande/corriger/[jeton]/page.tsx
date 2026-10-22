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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-4xl">Corriger ma demande</h1>
      <Suspense fallback={<p className="mt-4 text-encre-doux">Chargement…</p>}>
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
  if (lecture.etat !== 'valide') return <p className="panneau mt-6 max-w-2xl p-5 text-lg">{MESSAGES[lecture.etat]}</p>;

  const surlignes = lecture.champs.flatMap((c) => CHAMPS_FORMULAIRE[c]);
  // E3.3 : chaque champ surligné a une explication ; sans commentaire du conseiller, une phrase par défaut
  const commentaires = Object.fromEntries(lecture.champs.map((c) => [c, lecture.commentaires[c] ?? COMMENTAIRE_PAR_DEFAUT]));
  const expire = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(lecture.expireLe));
  return (
    <>
      <div className="mt-6 grid max-w-6xl gap-6 md:grid-cols-[3fr_2fr]">
      <section id="points-a-revoir" className="rounded-xl border border-ciel border-l-[6px] border-l-encre bg-ciel-pale px-5 py-5 text-encre">
        <h2 className="text-xl text-encre!">Pourquoi votre conseiller vous recontacte</h2>
        <p className="mt-2 whitespace-pre-line text-sm">{lecture.motif}</p>
        <h3 className="mt-4 text-base text-encre!">Les points à revoir</h3>
        <ul className="mt-1 list-inside list-disc text-sm">
          {lecture.champs.map((c) => (
            <li key={c}>
              {LIBELLES_CHAMPS[c]}
              {lecture.commentaires[c] && <span> : {lecture.commentaires[c]}</span>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="comment-faire" className="panneau p-5 text-sm">
        <h2 id="comment-faire" className="text-xl">Comment faire</h2>
        <ol className="mt-2 flex list-inside list-decimal flex-col gap-1.5">
          <li>Modifiez les champs surlignés : l’explication de votre conseiller est juste en dessous. Vous pouvez aussi changer le reste.</li>
          <li>Si une information signalée est exacte telle quelle, vous pourrez le confirmer au moment de l’envoi.</li>
          <li>Envoyez : votre conseiller reprend votre demande et vous répond par e-mail.</li>
        </ol>
        <p className="mt-3 text-encre-doux">Ce lien ne sert qu’une fois et reste valable jusqu’au {expire}.</p>
      </section>
      </div>
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
