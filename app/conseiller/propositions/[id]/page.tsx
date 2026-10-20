import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { PropositionsFixtures } from '@/src/infrastructure/fixtures/propositionsFixtures';
import { Ecart } from '../../_composants/ecart';

// Proposition : prix proposé, prix revérifié par l'agent et écart, ligne par ligne (E8.4).
export default function PropositionPage({ params }: PageProps<'/conseiller/propositions/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <Link href="/conseiller" className="text-sm underline underline-offset-4">
        ← Espace conseiller
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-600">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<PageProps<'/conseiller/propositions/[id]'>, 'params'>) {
  const { id } = await params;
  await exigerConseiller(`/conseiller/propositions/${id}`);

  const lecture = new PropositionsFixtures();
  const proposition = await lecture.proposition(id);
  if (!proposition) notFound();
  const lignes = await Promise.all(
    proposition.lignes.map(async (ligne) => {
      const verification = await lecture.verificationDeLigne(ligne.id);
      return { ligne, verification, ecart: verification && ecartPrix(ligne, verification) };
    }),
  );

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold">Proposition v{proposition.version}</h1>
      <p className="mt-1 text-zinc-600">
        Statut : {proposition.statut} · Total : {proposition.total_cents === null ? '—' : euros(proposition.total_cents)}
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-300 text-zinc-600">
            <tr>
              <th className="py-2 pr-4 font-medium">Prestation</th>
              <th className="py-2 pr-4 font-medium">Date</th>
              <th className="py-2 pr-4 text-right font-medium">Pers.</th>
              <th className="py-2 pr-4 text-right font-medium">Prix proposé</th>
              <th className="py-2 pr-4 text-right font-medium">Prix revérifié</th>
              <th className="py-2 pr-4 text-right font-medium">Écart (unitaire)</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ ligne, verification, ecart }) => (
              <tr key={ligne.id} className="border-b border-zinc-200">
                <td className="py-3 pr-4">{ligne.prestation.nom}</td>
                <td className="py-3 pr-4">{ligne.date}</td>
                <td className="py-3 pr-4 text-right">{ligne.participants}</td>
                <td className="py-3 pr-4 text-right">{euros(ligne.prix_unitaire_catalogue_cents)}</td>
                <td className="py-3 pr-4 text-right">
                  {verification?.prix_unitaire_cents == null ? '—' : euros(verification.prix_unitaire_cents)}
                </td>
                <td className="py-3 pr-4 text-right">
                  {verification ? <Ecart ecart={ecart} /> : <span className="text-zinc-500">pas encore vérifié</span>}
                </td>
                <td className="py-3 text-right">
                  {verification && (
                    <Link
                      href={`/conseiller/propositions/${proposition.id}/lignes/${ligne.id}`}
                      className="underline underline-offset-4"
                    >
                      Détail
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
