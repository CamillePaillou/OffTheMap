import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { normaliserReference } from '@/src/domain/suiviClient';
import { EspaceClientSupabase } from '@/src/infrastructure/db/espaceClientSupabase';
import { Saut } from '../_composants/saut';
import { SuiviVoyage } from '../_composants/suivi-voyage';

export const metadata: Metadata = { title: 'Suivre ma demande' };

const champ = 'rounded-[10px] border-[1.5px] border-ballast bg-carte px-3 py-2.5 font-semibold tracking-[0.06em] uppercase hover:border-encre';

// Suivi sans compte, comme un colis : le numéro de dossier donné à l'envoi de la demande suffit. On montre l'étape et
// la date de mise à jour, rien d'autre : ni nom, ni destination, ni prix (un numéro peut circuler).
export default function SuiviPage({ searchParams }: PageProps<'/suivi'>) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-4xl sm:text-5xl">
        Où en est mon <Saut avant="v" apres="yage" /> ?
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">
        Saisissez le numéro de dossier reçu à l’envoi de votre demande. Il commence par DT, par exemple DT-7K4P-2QXM.
      </p>
      <Suspense fallback={<Formulaire />}>
        <Resultat searchParams={searchParams} />
      </Suspense>
      <p className="mt-10 text-[15px] text-encre-doux">
        Pour lire votre proposition et y répondre en ligne :{' '}
        <Link href="/compte" className="font-semibold text-encre underline underline-offset-4">
          ouvrir mon espace
        </Link>
        .
      </p>
    </main>
  );
}

function Formulaire({ valeur }: { valeur?: string }) {
  return (
    <form method="get" action="/suivi" className="mt-8 flex max-w-xl flex-col gap-2">
      <label htmlFor="numero" className="text-sm font-medium">
        Numéro de dossier
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="numero" name="numero" required defaultValue={valeur} autoComplete="off" spellCheck={false} placeholder="DT-XXXX-XXXX" className={`${champ} flex-1`} />
        <button type="submit" className="btn-principal">
          Suivre
        </button>
      </div>
    </form>
  );
}

async function Resultat({ searchParams }: Pick<PageProps<'/suivi'>, 'searchParams'>) {
  const { numero } = await searchParams;
  const saisie = typeof numero === 'string' ? numero.slice(0, 40) : '';
  if (!saisie) return <Formulaire />;

  const reference = normaliserReference(saisie);
  const suivi = reference ? await new EspaceClientSupabase().suiviPublic(reference) : null;
  return (
    <>
      <Formulaire valeur={reference ?? saisie} />
      {suivi ? (
        <section className="panneau mt-8 p-5 sm:p-7" aria-live="polite">
          <h2 className="text-2xl">Dossier {suivi.reference}</h2>
          <div className="mt-5">
            <SuiviVoyage dossier={suivi.dossier_statut} proposition={suivi.proposition_statut} misAJourLe={suivi.mis_a_jour_le} />
          </div>
        </section>
      ) : (
        <p role="alert" className="mt-6 max-w-xl rounded-lg border-l-4 border-brique bg-brique-pale px-3 py-2 text-brique-texte">
          Aucun dossier ne porte le numéro {reference ?? saisie}. Vérifiez-le sur la page affichée après l’envoi de votre demande : 8
          caractères après DT, sans O, I ni L.
        </p>
      )}
    </>
  );
}
