import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { etatEnvoi } from '@/src/application/tarifs';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { TarifsSupabase } from '@/src/infrastructure/db/tarifsSupabase';
import { Ecart } from '../../_composants/ecart';
import { STATUT_PROPOSITION } from '../../_composants/libelles';
import { resumerProposition } from '@/src/domain/proposition/resumeProposition';
import { REGLES_CHIFFRAGE } from '@/types/chiffrage';
import { ActionsLigne, PanneauEnvoi } from './actions-tarifs';
import { PanneauChangement } from './panneau-changement';
import { PanneauReponse } from './panneau-reponse';
import { CarteMail } from '../../_composants/carte-mail';
import { lignesPourMail, sejourDe } from '../../_composants/donnees-mail';
import { lienMailto, mailProposition, MailImpossibleErreur } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { BoutonRelancerBrouillon, RafraichirPendantGeneration } from './suivi-brouillon';

const STATUT_LIGNE = { a_verifier: 'à vérifier', confirme: 'confirmé', indisponible: 'indisponible', remplacee: 'remplacée', reservee: 'réservée' } as const;
const HORS_TOTAL: readonly string[] = REGLES_CHIFFRAGE.statutsHorsTotal; // lignes indisponibles ou remplacées : hors total
const SOURCE = { agent: 'agent', telephone: 'téléphone', mail: 'mail', lien: 'lien' } as const;
const instant = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });

// Proposition : prix proposé, prix revérifié par l'agent et écart (E8.4) ; tarifs confirmés et envoi (E5.1).
export default function PropositionPage({ params }: PageProps<'/conseiller/propositions/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
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
  const total = modifiable && envoi ? envoi.chiffrage.total_cents : proposition.total_cents;
  const resume = resumerProposition({ total_cents: total, budget_reference_cents: proposition.budget_reference_cents, alertes });

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
      <Link href={`/conseiller/dossiers/${proposition.dossier_id}`} className="text-sm underline underline-offset-4">
        ← Fiche du dossier
      </Link>
      <h1 className="mt-6 text-2xl font-semibold">Proposition v{proposition.version}</h1>
      <p className="mt-1 text-zinc-600">{STATUT_PROPOSITION[proposition.statut]}</p>
      <p className="mt-3 text-lg">
        Total : <strong>{total === null ? '—' : euros(total)}</strong>
        {resume.budget && (
          <span className={`ml-2 text-base ${resume.budget.depasse ? 'text-red-700' : resume.budget.part_pourcent >= 90 ? 'text-amber-700' : 'text-zinc-600'}`}>
            sur un budget de {euros(resume.budget.reference_cents)} ({resume.budget.part_pourcent} %)
          </span>
        )}
      </p>

      {proposition.statut === 'remplacee' && (
        <p className="mt-6 rounded border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Version remplacée après un changement demandé par le client. Elle reste telle qu’elle a été envoyée ; la version suivante est
          dans la{' '}
          <Link href={`/conseiller/dossiers/${proposition.dossier_id}`} className="underline underline-offset-4">
            fiche du dossier
          </Link>
          .
        </p>
      )}
      {proposition.motif_changement && (
        <p className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="font-medium">Changement demandé par le client :</span> {proposition.motif_changement}
        </p>
      )}

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
              <th className="py-2 pr-4 text-right font-medium">Total ligne</th>
              <th className="py-2 pr-4 text-right font-medium">Prix revérifié</th>
              <th className="py-2 pr-4 text-right font-medium">Écart (unitaire)</th>
              <th className="py-2 pr-4 font-medium">Tarif</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ ligne, verification, ecart }) => (
              <tr key={ligne.id} className="border-b border-zinc-200">
                <td className="py-3 pr-4">
                  {ligne.prestation.nom}
                  {resume.parLigne.get(ligne.id)?.map((a, i) => (
                    <span key={i} className={`block text-xs ${a.bloquante ? 'text-red-700' : 'text-amber-700'}`}>
                      {a.libelle}
                    </span>
                  ))}
                </td>
                <td className="py-3 pr-4">{ligne.date}</td>
                <td className="py-3 pr-4 text-right">{ligne.participants}</td>
                <td className="py-3 pr-4 text-right">{euros(ligne.prix_unitaire_catalogue_cents)}</td>
                <td className={`py-3 pr-4 text-right ${HORS_TOTAL.includes(ligne.statut) ? 'text-zinc-400 line-through' : ''}`}>
                  {euros(ligne.total_ligne_cents)}
                </td>
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
          <h2 className="font-semibold">
            Alertes{resume.bloquantes > 0 && <span className="ml-2 text-sm font-normal text-red-700">{resume.bloquantes} bloquante{resume.bloquantes > 1 ? 's' : ''}</span>}
          </h2>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {[...resume.generales, ...[...resume.parLigne.values()].flat()].map((a, i) => (
              <li key={i}>
                <span className={a.bloquante ? 'font-medium text-red-700' : 'font-medium text-amber-700'}>{a.libelle}</span>
                {a.bloquante ? ' (bloque l’envoi)' : ''} : {a.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {modifiable && envoi && <PanneauEnvoi propositionId={proposition.id} bloquants={envoi.bloquants} />}

      <PanneauReponse propositionId={proposition.id} statut={proposition.statut} />
      {proposition.statut === 'envoyee' && <PanneauChangement propositionId={proposition.id} version={proposition.version} />}

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
