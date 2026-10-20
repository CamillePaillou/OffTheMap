import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { clientSupabase } from '@/lib/supabase/serveur';
import { MailImpossibleErreur, mailProposition } from '@/src/domain/mails';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { lignesPourMail, sejourDe } from '../../../_composants/donnees-mail';
import { BoutonImprimer } from './bouton-imprimer';

type Props = PageProps<'/conseiller/propositions/[id]/imprimer'>;

const Programme = z.array(z.object({ date: z.string(), titre: z.string(), texte: z.string() }));
const euros = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const jour = (d: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date(`${d}T12:00:00Z`));

// Version imprimable de la proposition (E5.4) : prix vérifiés uniquement ; « Enregistrer au format PDF » du navigateur.
export default function ImprimerPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <Suspense fallback={<p className="text-zinc-600">Chargement…</p>}>
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
        <p className="text-zinc-700">Cette proposition a encore des prix non vérifiés : elle ne peut pas être imprimée pour le client.</p>
        <Link href={`/conseiller/propositions/${id}`} className="mt-4 inline-block text-sm underline underline-offset-4">
          ← Proposition
        </Link>
      </>
    );
  }

  const supabase = await clientSupabase();
  const { data } = await supabase.from('propositions').select('programme').eq('id', id).maybeSingle();
  const programme = Programme.safeParse(data?.programme ?? []);
  const lignes = proposition.lignes.filter((l) => l.statut !== 'remplacee' && l.statut !== 'indisponible');
  const total = lignes.reduce((s, l) => s + l.prix_confirme!.montant_cents * l.participants, 0);
  const { demande } = dossier;

  return (
    <article className="text-zinc-900">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link href={`/conseiller/propositions/${id}`} className="text-sm underline underline-offset-4">
          ← Proposition
        </Link>
        <BoutonImprimer />
      </div>

      <header className="border-b border-zinc-300 pb-4">
        <p className="text-sm uppercase tracking-wide text-zinc-500">Detour · proposition de voyage</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {demande.destination ?? 'Votre séjour'} · {demande.client.nom}
        </h1>
        <p className="mt-1 text-zinc-700">
          Du {jour(demande.dates.debut)} au {jour(demande.dates.fin)} · {demande.voyageurs.length} voyageur{demande.voyageurs.length > 1 ? 's' : ''}
        </p>
      </header>

      {programme.success && programme.data.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Programme</h2>
          {programme.data.map((j) => (
            <div key={`${j.date}-${j.titre}`} className="mt-3 break-inside-avoid">
              <h3 className="font-medium">
                {jour(j.date)} · {j.titre}
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm text-zinc-800">{j.texte}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mt-8 break-inside-avoid">
        <h2 className="text-lg font-semibold">Prestations et prix</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="border-b border-zinc-300 text-zinc-600">
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
              <tr key={l.id} className="border-b border-zinc-200">
                <td className="py-2 pr-4">{jour(l.date)}</td>
                <td className="py-2 pr-4">{l.prestation.nom}</td>
                <td className="py-2 pr-4 text-right">{l.participants}</td>
                <td className="py-2 pr-4 text-right">{euros(l.prix_confirme!.montant_cents)}</td>
                <td className="py-2 text-right">{euros(l.prix_confirme!.montant_cents * l.participants)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="py-3 pr-4 text-right font-semibold">
                Total pour le groupe
              </td>
              <td className="py-3 text-right font-semibold">{euros(total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-zinc-500">Prix vérifiés auprès de nos prestataires. Taxes non comprises (catalogue fictif).</p>
      </section>

      <footer className="mt-10 text-sm text-zinc-700">
        <p>Votre conseiller : {conseiller.nomAffiche}, Detour.</p>
        <p>Pour accepter cette proposition, répondez au mail qui l’accompagne.</p>
      </footer>
    </article>
  );
}
