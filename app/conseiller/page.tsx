import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { deconnecter } from '../connexion/actions';

// Back-office des conseillers (P2). Sans connexion, le proxy et exigerConseiller() renvoient vers /connexion.
export default function ConseillerPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-24">
      <h1 className="text-2xl font-semibold">Espace conseiller</h1>
      <Suspense fallback={<p className="mt-4 text-zinc-600">Chargement…</p>}>
        <Contenu />
      </Suspense>
    </main>
  );
}

async function Contenu() {
  const conseiller = await exigerConseiller();
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-zinc-600">Connecté en tant que {conseiller.nomAffiche}.</p>
        <form action={deconnecter}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </div>
      <p className="mt-4 text-zinc-600">Liste des dossiers à venir.</p>
    </>
  );
}
