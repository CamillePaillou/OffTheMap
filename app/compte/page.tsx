import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { exigerClient } from '@/lib/auth/client';
import { EspaceClientSupabase } from '@/src/infrastructure/db/espaceClientSupabase';
import { jour } from '@/app/conseiller/_composants/libelles';
import { SuiviVoyage } from '../_composants/suivi-voyage';
import { deconnecterClient } from './actions';

export const metadata: Metadata = { title: 'Mes demandes' };

// Espace client : les demandes faites avec l'adresse confirmée du compte, et où en est chacune.
export default function ComptePage({ searchParams }: PageProps<'/compte'>) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<p className="text-encre-doux">Chargement…</p>}>
        <Contenu searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenu({ searchParams }: Pick<PageProps<'/compte'>, 'searchParams'>) {
  const client = await exigerClient('/compte');
  const motDePasseChange = (await searchParams)['mot-de-passe'] === 'change';
  const demandes = client.confirme ? await new EspaceClientSupabase().mesDemandes() : [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">Mes demandes</h1>
          <p className="mt-2 text-encre-doux">{client.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/compte/nouveau-mot-de-passe" className="btn-second">
            Changer de mot de passe
          </Link>
          <form action={deconnecterClient}>
            <button type="submit" className="btn-second">
              Se déconnecter
            </button>
          </form>
        </div>
      </div>

      {motDePasseChange && (
        <p role="status" className="mt-6 rounded-lg border-l-4 border-encre bg-ciel-pale px-3 py-2 text-encre">
          Mot de passe enregistré.
        </p>
      )}

      {!client.confirme && (
        <p className="mt-8 rounded-lg border-l-4 border-encre bg-ciel-pale px-3 py-3 text-encre">
          Confirmez votre adresse avec le lien reçu par e-mail : vos demandes apparaîtront ici ensuite.
        </p>
      )}

      {client.confirme && demandes.length === 0 && (
        <div className="panneau mt-8 p-6 sm:p-8">
          <p className="text-lg">Aucune demande faite avec {client.email} pour l’instant.</p>
          <p className="mt-2 text-encre-doux">
            Une demande faite avec une autre adresse se suit avec son numéro de dossier, sur la page{' '}
            <Link href="/suivi" className="text-encre underline underline-offset-4">
              Suivre ma demande
            </Link>
            .
          </p>
          <Link href="/demande" className="btn-principal mt-6">
            Composer mon week-end
          </Link>
        </div>
      )}

      <ul className="mt-8 flex flex-col gap-6">
        {demandes.map((d) => (
          <li key={d.dossier_id} className="panneau p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="text-2xl">
                <Link href={`/compte/demandes/${d.dossier_id}`} className="no-underline hover:underline">
                  {d.destination ? `Week-end à ${d.destination}` : 'Week-end surprise'}
                </Link>
              </h2>
              <p className="text-encre-doux">
                du {jour(d.date_debut)} au {jour(d.date_fin)} · dossier <span className="font-semibold text-encre">{d.reference}</span>
              </p>
            </div>
            <div className="mt-5">
              <SuiviVoyage dossier={d.statut} proposition={d.proposition_statut} compacte />
            </div>
            <Link href={`/compte/demandes/${d.dossier_id}`} className="mt-4 inline-block font-semibold underline underline-offset-4">
              Voir le détail{d.proposition_statut === 'envoyee' || d.proposition_statut === 'sans_reponse' ? ' et répondre' : ''}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
