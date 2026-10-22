import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { MailImpossibleErreur, mailProposition } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { Logo, Monogramme } from '@/app/_composants/logo';
import { lignesPourMail, sejourDe } from '../../../_composants/donnees-mail';
import { dateDeVerification, jourCourt } from '../../../_composants/libelles';
import { BoutonImprimer } from './bouton-imprimer';

type Props = PageProps<'/conseiller/propositions/[id]/imprimer'>;

const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const jour = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date(`${d}T12:00:00Z`));

// Version imprimable de la proposition (E5.4), le « carnet de route » de la charte DÉTOUR : un billet (trajet, dates,
// voyageurs, total), le programme, chaque prix avec l'heure de sa vérification, la signature du conseiller.
// Prix vérifiés uniquement ; « Enregistrer au format PDF » du navigateur.
export default function ImprimerPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <Suspense fallback={<p className="text-encre-doux">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id } = await params;
  const conseiller = await exigerConseiller(`/conseiller/propositions/${id}/imprimer`);
  const proposition = await new PropositionsSupabase().proposition(id);
  if (!proposition) notFound();
  const dossier = await new DossiersSupabase().detail(proposition.dossier_id);
  if (!dossier) notFound();

  // rien ne part avec un prix non vérifié : même règle que le mail de la proposition
  try {
    mailProposition(sejourDe(dossier, conseiller.nomAffiche), lignesPourMail(proposition));
  } catch (e) {
    if (!(e instanceof MailImpossibleErreur)) throw e;
    return (
      <>
        <p className="text-encre">Cette proposition a encore des prix non vérifiés : elle ne peut pas être imprimée pour le client.</p>
        <Link href={`/conseiller/propositions/${id}`} className="mt-4 inline-block text-sm underline underline-offset-4">
          ← Proposition
        </Link>
      </>
    );
  }

  const lignes = proposition.lignes.filter((l) => l.statut !== 'remplacee' && l.statut !== 'indisponible');
  const total = lignes.reduce((s, l) => s + l.prix_confirme!.montant_cents * l.participants, 0);
  // la plus ancienne vérification : le total n'est pas plus récent qu'elle
  const verifieLe = lignes.map((l) => l.prix_confirme!.le).sort()[0]!;
  const programme = proposition.programme ?? [];
  const { demande } = dossier;
  const prenom = conseiller.nomAffiche.trim().split(/\s+/)[0]!;
  const voyageurs = `${demande.voyageurs.length} voyageur${demande.voyageurs.length > 1 ? 's' : ''}`;

  return (
    <article className="text-encre">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link href={`/conseiller/propositions/${id}`} className="text-sm underline underline-offset-4">
          ← Proposition
        </Link>
        <BoutonImprimer />
      </div>

      {/* le billet : partie principale et talon encre au monogramme (brand kit, « carnet de route ») */}
      <header className="grid grid-cols-[minmax(0,1fr)_56px] overflow-hidden sm:grid-cols-[minmax(0,1fr)_88px] rounded-2xl bg-carte print:border print:border-trait">
        <div className="flex flex-col gap-4 border-r-2 border-dashed border-encre/30 p-5 sm:p-6">
          <Logo titre="DÉTOUR" className="h-[34px] w-auto self-start" />
          <p className="font-titre text-[2rem] font-extrabold leading-none tracking-[-0.025em]">Paris → {demande.destination ?? 'votre destination'}</p>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-y-1.5 text-sm">
            <dt className="text-encre-doux">Pour</dt>
            <dd>{demande.client.nom}</dd>
            <dt className="text-encre-doux">Dates</dt>
            <dd>
              du {jour(demande.dates.debut)} au {jour(demande.dates.fin)}
            </dd>
            <dt className="text-encre-doux">Voyageurs</dt>
            <dd>{demande.voyageurs.length}</dd>
            <dt className="text-encre-doux">Total</dt>
            <dd className="font-titre text-lg font-extrabold">{euros(total)}</dd>
          </dl>
          <p className="self-start rounded-md bg-ciel px-2.5 py-1.5 text-xs">
            Prix vérifiés {dateDeVerification(verifieLe)} · Composé par {prenom}
          </p>
        </div>
        <div className="flex items-center justify-center bg-encre p-3">
          <Monogramme pastille titre="" className="w-10 sm:w-16" />
        </div>
      </header>

      {programme.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl">Au programme</h2>
          {programme.map((j) => (
            <div key={`${j.date}-${j.titre}`} className="mt-4 break-inside-avoid">
              <h3 className="text-lg">
                {jour(j.date)} · {j.titre}
              </h3>
              <p className="mt-1 whitespace-pre-line">{j.texte}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-10 break-inside-avoid">
        <h2 className="text-2xl">Prestations et prix</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-trait text-encre-doux">
              <tr>
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Prestation</th>
                <th className="py-2 pr-4 text-right font-medium">Pers.</th>
                <th className="py-2 pr-4 text-right font-medium">Prix / pers.</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.id} className="border-b border-trait align-top">
                  <td className="py-2.5 pr-4 whitespace-nowrap">{jourCourt(l.date)}</td>
                  <td className="py-2.5 pr-4">
                    {l.prestation.nom}
                    <span className="block text-xs text-encre-doux">Prix vérifié {dateDeVerification(l.prix_confirme!.le)}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right">{l.participants}</td>
                  <td className="py-2.5 pr-4 text-right">{euros(l.prix_confirme!.montant_cents)}</td>
                  <td className="py-2.5 text-right">{euros(l.prix_confirme!.montant_cents * l.participants)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-3 pr-4 text-right font-semibold">
                  Total pour le groupe ({voyageurs})
                </td>
                <td className="py-3 text-right font-titre text-lg font-extrabold">{euros(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-encre-doux">Chaque prix a été vérifié auprès de nos partenaires, à la date indiquée. Catalogue fictif.</p>
      </section>

      <footer className="mt-10 break-inside-avoid rounded-2xl bg-carte p-6 print:border print:border-trait">
        <p>
          J’ai composé ce voyage pour vous et vérifié chaque prix. Pour l’accepter, répondez simplement au mail qui l’accompagne : je
          vous indiquerai alors le montant du dépôt de garantie.
        </p>
        <p className="mt-3 font-titre text-xl font-semibold">{prenom}</p>
        <p className="text-sm text-encre-doux">DÉTOUR · Prenez le pas de côté.</p>
      </footer>
    </article>
  );
}
