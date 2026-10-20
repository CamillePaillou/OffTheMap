import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { etatEnvoi } from '@/src/application/tarifs';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { TarifsSupabase } from '@/src/infrastructure/db/tarifsSupabase';
import { Ecart } from '../../_composants/ecart';
import { ActionsLigne, PanneauEnvoi } from './actions-tarifs';
import { PanneauReponse } from './panneau-reponse';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailProposition, MailImpossibleErreur } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { BoutonRelancerBrouillon, RafraichirPendantGeneration } from './suivi-brouillon';

const STATUT_LIGNE = { a_verifier: 'à vérifier', confirme: 'confirmé', indisponible: 'indisponible', remplacee: 'remplacée', reservee: 'réservée' } as const;
const SOURCE = { agent: 'agent', telephone: 'téléphone', mail: 'mail', lien: 'lien' } as const;
const instant = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });

// Proposition : prix proposé, prix revérifié par l'agent et écart (E8.4) ; tarifs confirmés et envoi (E5.1).
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
  const conseiller = await exigerConseiller(`/conseiller/propositions/${id}`);

  const lecture = new PropositionsSupabase();
  const proposition = await lecture.proposition(id);
  if (!proposition) notFound();
  // E5.1 : ce qui bloque l'envoi, recalculé depuis la base (sans rien écrire)
  const chiffrage = await new TarifsSupabase().lireChiffrage(id);
  const envoi = chiffrage ? etatEnvoi(chiffrage) : null;
  const modifiable = proposition.statut === 'a_verifier' || proposition.statut === 'prete';
  const alertes = modifiable && envoi ? envoi.chiffrage.alertes : proposition.alertes;

  // mail de la proposition (E5.4) : seulement une fois envoyée, donc tous ses prix vérifiés (E5.1)
  const envoyee = ['envoyee', 'sans_reponse', 'changement_demande', 'acceptee', 'depot_recu', 'reservee'].includes(proposition.statut);
  const dossier = envoyee ? await new DossiersSupabase().detail(proposition.dossier_id) : null;
  let mail: { sujet: string; corps: string; mailto: string } | null = null;
  if (dossier) {
    try {
      const m = mailProposition(sejourDe(dossier, conseiller.nomAffiche), lignesPourMail(proposition));
      mail = { ...m, mailto: lienMailto(dossier.demande.client.email, m) };
    } catch (e) {
      if (!(e instanceof MailImpossibleErreur)) throw e;
    }
  }
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

      {proposition.statut === 'brouillon_en_cours' && (
        <p role="status" className="mt-6 text-zinc-600">
          Brouillon en cours de génération…
          <RafraichirPendantGeneration />
        </p>
      )}
      {proposition.statut === 'erreur' && (
        <section className="mt-6 rounded border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">La génération du brouillon a échoué.</p>
          <div className="mt-3">
            <BoutonRelancerBrouillon propositionId={proposition.id} />
          </div>
        </section>
      )}

      {proposition.programme && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Programme</h2>
          <ol className="mt-2 flex flex-col gap-3 text-sm">
            {proposition.programme.map((jour, i) => (
              <li key={i}>
                <span className="font-medium">{jour.date} · {jour.titre}</span>
                <p className="mt-1 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{jour.texte}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

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
              <th className="py-2 pr-4 font-medium">Tarif</th>
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
                <td className="py-3 pr-4">
                  <span className={ligne.statut === 'confirme' ? 'text-green-800' : ligne.statut === 'a_verifier' ? 'text-amber-800' : 'text-zinc-600'}>
                    {STATUT_LIGNE[ligne.statut]}
                  </span>
                  {ligne.prix_confirme && (
                    <span className="block text-xs text-zinc-600">
                      {euros(ligne.prix_confirme.montant_cents)} · {SOURCE[ligne.prix_confirme.source]} · {instant(ligne.prix_confirme.le)} ·{' '}
                      {ligne.prix_confirme.par}
                    </span>
                  )}
                  <div className="mt-2">
                    <ActionsLigne
                      propositionId={proposition.id}
                      ligneId={ligne.id}
                      statut={ligne.statut}
                      figee={!modifiable}
                      verification={ligne.derniere_verification}
                    />
                  </div>
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={`/conseiller/propositions/${proposition.id}/lignes/${ligne.id}`}
                    className="underline underline-offset-4"
                  >
                    {verification ? 'Détail' : 'Vérifier'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alertes.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Alertes</h2>
          <ul className="mt-1 list-inside list-disc text-sm">
            {alertes.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
        </section>
      )}

      {modifiable && envoi && <PanneauEnvoi propositionId={proposition.id} bloquants={envoi.bloquants} />}

      <PanneauReponse propositionId={proposition.id} statut={proposition.statut} />

      {mail && (
        <section className="mt-8">
          <h2 className="font-semibold">Mail au client</h2>
          <div className="mt-2">
            <CarteMail
              dossierId={proposition.dossier_id}
              propositionId={proposition.id}
              modele="proposition"
              titre="Mail « Proposition »"
              sujet={mail.sujet}
              corps={mail.corps}
              mailto={mail.mailto}
              imprimer={`/conseiller/propositions/${proposition.id}/imprimer`}
              ouvert={proposition.statut === 'envoyee'}
            />
          </div>
        </section>
      )}
    </>
  );
}
