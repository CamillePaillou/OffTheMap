import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerClient } from '@/lib/auth/client';
import { peutRepondre } from '@/src/domain/suiviClient';
import { prenomDe } from '@/src/domain/mails';
import { EspaceClientSupabase } from '@/src/infrastructure/db/espaceClientSupabase';
import type { LignePropositionClient, PropositionClient } from '@/src/ports/espaceClient';
import { dateDeVerification, euros, jour, jourCourt } from '@/app/conseiller/_composants/libelles';
import { SuiviVoyage, quand } from '../../../_composants/suivi-voyage';
import { FormulaireReponse } from '../../formulaires';

export const metadata: Metadata = { title: 'Ma demande' };

const jourLong = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

// Détail d'une demande du client : où elle en est, la proposition envoyée (programme, prix vérifiés et datés,
// signée du prénom du conseiller) et la réponse en ligne.
export default function DemandeClientPage({ params }: PageProps<'/compte/demandes/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <Suspense fallback={<p className="text-encre-doux">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<PageProps<'/compte/demandes/[id]'>, 'params'>) {
  const { id } = await params;
  await exigerClient(`/compte/demandes/${id}`);
  const d = await new EspaceClientSupabase().maDemande(id);
  if (!d) notFound(); // dossier d'un autre client : comme un dossier inexistant

  const p = d.proposition;
  const reponseTransmise = !!p?.reponse && (p.statut === 'envoyee' || p.statut === 'sans_reponse');

  return (
    <>
      <p>
        <Link href="/compte" className="text-[15px] underline underline-offset-4">
          Mes demandes
        </Link>
      </p>
      <h1 className="mt-3 text-4xl">{d.demande?.destination ? `Week-end à ${d.demande.destination}` : 'Week-end surprise'}</h1>
      {d.demande && (
        <p className="mt-2 text-lg">
          du {jour(d.demande.date_debut)} au {jour(d.demande.date_fin)} · {d.demande.voyageurs} voyageur{d.demande.voyageurs > 1 ? 's' : ''}
        </p>
      )}
      <p className="mt-1 text-encre-doux">
        Dossier <span className="font-semibold text-encre">{d.reference}</span>, demandé {quand(d.cree_le)}
      </p>

      <section className="panneau mt-8 p-5 sm:p-7">
        <SuiviVoyage dossier={d.statut} proposition={d.proposition_statut} misAJourLe={d.mis_a_jour_le} reponseTransmise={reponseTransmise} />
      </section>

      {p && <Proposition p={p} />}
    </>
  );
}

function Proposition({ p }: { p: PropositionClient }) {
  const conseiller = p.conseiller ? prenomDe(p.conseiller) : 'Votre conseiller';
  const programme = Array.isArray(p.programme) ? (p.programme as { date: string; titre: string; texte: string }[]) : [];
  // jamais de prix non vérifié : une ligne sans prix confirmé et daté est montrée sans montant, et le total n'est pas affiché
  const verifiees = (l: LignePropositionClient): l is LignePropositionClient & { prix_unitaire_cents: number; confirme_le: string } =>
    l.prix_unitaire_cents !== null && l.confirme_le !== null;
  const toutesVerifiees = p.lignes.length > 0 && p.lignes.every(verifiees);
  const total = toutesVerifiees ? p.lignes.reduce((s, l) => s + l.prix_unitaire_cents! * l.participants, 0) : null;
  const ouverte = peutRepondre(p.statut, !!p.reponse);

  return (
    <>
      <section className="mt-10">
        <h2 className="text-3xl">Votre proposition</h2>
        <p className="mt-1 text-encre-doux">
          Version {p.version}, envoyée {quand(p.envoyee_le)} par {conseiller}
        </p>

        {programme.length > 0 && (
          <div className="mt-6 flex flex-col gap-5">
            {programme.map((j) => (
              <div key={`${j.date}-${j.titre}`}>
                <h3 className="text-xl">
                  {jourLong(j.date)} · {j.titre}
                </h3>
                <p className="mt-1 max-w-[70ch] whitespace-pre-line leading-relaxed">{j.texte}</p>
              </div>
            ))}
          </div>
        )}

        <div className="panneau mt-8 overflow-x-auto p-4 sm:p-6">
          <table className="w-full text-left text-[15px]">
            <caption className="sr-only">Prestations et prix</caption>
            <thead className="border-b border-trait text-encre-doux">
              <tr>
                <th className="py-2 pr-3 font-medium sm:pr-4">Date</th>
                <th className="py-2 pr-4 font-medium">Prestation</th>
                <th className="hidden py-2 pr-4 text-right font-medium sm:table-cell">Pers.</th>
                <th className="hidden py-2 pr-4 text-right font-medium sm:table-cell">Prix / pers.</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.lignes.map((l) => (
                <tr key={`${l.date}-${l.nom}`} className="border-b border-trait align-top">
                  <td className="whitespace-nowrap py-2.5 pr-4">{jourCourt(l.date)}</td>
                  <td className="py-2.5 pr-4">
                    {l.nom}
                    {/* sur téléphone, les colonnes Pers. et Prix / pers. passent sous le nom */}
                    {verifiees(l) && <span className="block text-sm sm:hidden">{l.participants} × {euros(l.prix_unitaire_cents)}</span>}
                    <span className="block text-sm text-encre-doux">
                      {verifiees(l) ? `Prix vérifié ${dateDeVerification(l.confirme_le)}` : 'Prix en cours de vérification'}
                      {l.statut === 'reservee' ? ' · réservé' : ''}
                    </span>
                  </td>
                  <td className="hidden py-2.5 pr-4 text-right sm:table-cell">{l.participants}</td>
                  <td className="hidden py-2.5 pr-4 text-right sm:table-cell">{verifiees(l) ? euros(l.prix_unitaire_cents) : '—'}</td>
                  <td className="py-2.5 text-right">{verifiees(l) ? euros(l.prix_unitaire_cents * l.participants) : '—'}</td>
                </tr>
              ))}
            </tbody>
            {total !== null && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="py-3 pr-4 text-right font-semibold max-sm:hidden">
                    Total pour le groupe
                  </td>
                  <td colSpan={2} className="py-3 pr-4 text-right font-semibold sm:hidden">
                    Total pour le groupe
                  </td>
                  <td className="py-3 text-right font-titre text-xl font-extrabold">{euros(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="mt-3 text-sm text-encre-doux">Chaque prix a été vérifié auprès du prestataire, à la date indiquée. Catalogue fictif.</p>
        </div>
      </section>

      <section className="panneau mt-8 p-5 sm:p-7" aria-labelledby="titre-reponse">
        <h2 id="titre-reponse" className="text-2xl">
          Votre réponse
        </h2>
        {p.reponse ? (
          <div className="mt-3">
            <p>
              {p.reponse.type === 'acceptee' ? 'Vous avez accepté cette proposition' : 'Vous avez demandé un changement'} {quand(p.reponse.cree_le)}.
            </p>
            {p.reponse.message && <blockquote className="mt-2 border-l-4 border-trait pl-3 italic">{p.reponse.message}</blockquote>}
            <p className="mt-2 text-encre-doux">{conseiller} a reçu votre réponse et revient vers vous par e-mail.</p>
          </div>
        ) : ouverte ? (
          <div className="mt-4">
            <FormulaireReponse propositionId={p.id} conseiller={conseiller} />
          </div>
        ) : (
          <p className="mt-3 text-encre-doux">Cette proposition n’attend plus de réponse.</p>
        )}
      </section>
    </>
  );
}
