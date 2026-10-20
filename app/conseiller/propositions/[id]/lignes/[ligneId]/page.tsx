import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { Ecart } from '../../../../_composants/ecart';
import { BoutonReverifier } from './bouton-reverifier';

type Props = PageProps<'/conseiller/propositions/[id]/lignes/[ligneId]'>;

const ARRETS: Record<string, string> = {
  conclusion: 'conclusion rendue',
  tours_max: '3 tours atteints',
  echec_serveur: 'serveur en échec ou délai dépassé',
  reponse_invalide: 'réponse non conforme',
};

// Vérification d'une ligne : prix revérifié, écart avec le prix proposé, réponse brute du serveur et trace (E8.4).
export default function VerificationPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Suspense fallback={<p className="text-zinc-600">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id, ligneId } = await params;
  await exigerConseiller(`/conseiller/propositions/${id}/lignes/${ligneId}`);

  const lecture = new PropositionsSupabase();
  const ligne = (await lecture.proposition(id))?.lignes.find((l) => l.id === ligneId);
  if (!ligne) notFound();
  const verification = await lecture.verificationDeLigne(ligneId);

  return (
    <>
      <Link href={`/conseiller/propositions/${id}`} className="text-sm underline underline-offset-4">
        ← Proposition
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">{ligne.prestation.nom}</h1>
      <p className="mt-1 text-zinc-600">
        {ligne.date} · {ligne.participants} participant{ligne.participants > 1 ? 's' : ''} · {ligne.prestation.id}
      </p>

      <div className="mt-6">
        <BoutonReverifier propositionId={id} ligneId={ligne.id} deja={verification !== null} />
      </div>

      {!verification ? (
        <p className="mt-8 text-zinc-600">Cette ligne n’a pas encore été vérifiée.</p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Chiffre titre="Prix proposé" valeur={euros(ligne.prix_unitaire_catalogue_cents)} detail="par personne" />
            <Chiffre
              titre="Prix revérifié"
              valeur={verification.prix_unitaire_cents === null ? 'non vérifié' : euros(verification.prix_unitaire_cents)}
              detail="par personne"
            />
            <Chiffre titre="Écart (unitaire)" valeur={<Ecart ecart={ecartPrix(ligne, verification)} />} />
            <Chiffre titre="Écart (ligne)" valeur={<Ecart ecart={ecartPrix(ligne, verification)} total />} />
          </dl>

          <p className="mt-6 text-sm text-zinc-600">
            Statut : <strong>{verification.statut}</strong> · Places restantes : {verification.places_restantes ?? '—'} ·
            Arrêt : {ARRETS[verification.arret]} · {verification.nb_tours} tour(s) · {verification.modele} · demandée par{' '}
            {verification.demandee_par} le {new Date(verification.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
          </p>
          {verification.resume && <p className="mt-2 italic text-zinc-700">« {verification.resume} »</p>}

          <h2 className="mt-10 text-lg font-semibold">Réponse brute du serveur</h2>
          {verification.reponse_serveur == null ? (
            <p className="mt-2 text-zinc-600">Aucune réponse : le serveur n’a pas répondu.</p>
          ) : (
            <pre className="mt-2 overflow-x-auto rounded bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
              {JSON.stringify(verification.reponse_serveur, null, 2)}
            </pre>
          )}

          <h2 className="mt-10 text-lg font-semibold">Trace de l’agent</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-300 text-zinc-600">
                <tr>
                  <th className="py-2 pr-4 font-medium">Tour</th>
                  <th className="py-2 pr-4 font-medium">Appel</th>
                  <th className="py-2 pr-4 font-medium">Décision du code</th>
                  <th className="py-2 pr-4 font-medium">HTTP</th>
                  <th className="py-2 text-right font-medium">Durée</th>
                </tr>
              </thead>
              <tbody>
                {verification.trace.map((t) => (
                  <tr key={t.numero} className="border-b border-zinc-200 align-top">
                    <td className="py-2 pr-4">{t.numero}</td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {t.appel
                        ? `${t.appel.nom}(${JSON.stringify(t.appel.arguments)})`
                        : `conclusion : ${JSON.stringify(t.conclusion)}`}
                    </td>
                    <td className="py-2 pr-4">
                      {t.decision.statut}
                      {t.decision.raison && ` : ${t.decision.raison}`}
                      {t.decision.ecarts.map((e) => (
                        <span key={e.champ} className="block text-xs text-red-700">
                          {e.champ} : annoncé {String(e.annonce)}, serveur {e.serveur === null ? '—' : String(e.serveur)}
                        </span>
                      ))}
                    </td>
                    <td className="py-2 pr-4">{t.http_statut ?? (t.appel ? 'aucune réponse' : '—')}</td>
                    <td className="py-2 text-right">{t.duree_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Chiffre({ titre, valeur, detail }: { titre: string; valeur: React.ReactNode; detail?: string }) {
  return (
    <div className="rounded border border-zinc-200 p-3">
      <dt className="text-xs text-zinc-500">{titre}</dt>
      <dd className="mt-1 text-lg">{valeur}</dd>
      {detail && <dd className="text-xs text-zinc-500">{detail}</dd>}
    </div>
  );
}
