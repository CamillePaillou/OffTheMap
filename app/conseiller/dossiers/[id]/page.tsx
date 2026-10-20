import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { CorrectionsSupabase } from '@/src/infrastructure/db/correctionsSupabase';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import type { DetailDossier } from '@/types/dashboard';
import { DECISION, ETAT_FICHE, STATUT_DOSSIER, STATUT_PROPOSITION, euros, instantParis, jour } from '../../_composants/libelles';
import { BoutonBrouillon, BoutonRelancer, FormulaireCorrection } from './formulaires';
import { PanneauTri } from './panneauTri';

type Props = PageProps<'/conseiller/dossiers/[id]'>;

const REGIME: Record<string, string> = {
  vegetarien: 'végétarien', vegetalien: 'végétalien', sans_gluten: 'sans gluten', allergie: 'allergie alimentaire', autre: 'autre',
};

// Fiche d'un dossier (E2.1) : la demande du client, la fiche de l'IA, le tri (E3.1) et ce que le conseiller corrige après l'entretien.
export default function DossierPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Link href="/conseiller" className="text-sm underline underline-offset-4">
        ← Dossiers
      </Link>
      <Suspense fallback={<p className="mt-6 text-zinc-600">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id } = await params;
  await exigerConseiller(`/conseiller/dossiers/${id}`);
  const dossier = await new DossiersSupabase().detail(id);
  if (!dossier) notFound();
  const { demande, fiche } = dossier;
  const enErreur = dossier.statut === 'erreur' || fiche?.etat === 'erreur';
  // tri (E3.1) : sur une fiche prête, ou sur un dossier à corriger (valider, refuser, nouveau lien)
  // brouillon (E4.4) : après l'entretien, fiche corrigée (budget réel et dates fixes), aucune proposition encore
  const ficheComplete = fiche !== null && fiche.budget_reel_cents !== null && fiche.dates_fixes.debut !== null && fiche.dates_fixes.fin !== null;
  const peutDemanderBrouillon = (dossier.statut === 'entretien_fait' || dossier.statut === 'en_proposition') && dossier.propositions.length === 0;
  const aTrier = (dossier.statut === 'fiche_prete' || dossier.statut === 'a_corriger') && fiche !== null && fiche.etat !== 'erreur';
  const boucles = aTrier ? await new CorrectionsSupabase().boucles(dossier.dossier_id) : null;

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold">{demande.client.nom}</h1>
      <p className="mt-1 text-zinc-600">
        {STATUT_DOSSIER[dossier.statut]} · demande v{demande.version} reçue le {instantParis(dossier.cree_le)}
      </p>

      {enErreur && (
        <section className="mt-6 rounded border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">La génération de la fiche a échoué.</p>
          {fiche?.erreur && <p className="mt-1 text-sm text-red-800">{fiche.erreur}</p>}
          {dossier.statut === 'erreur' && (
            <div className="mt-3">
              <BoutonRelancer dossierId={dossier.dossier_id} />
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Demande du client</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-zinc-500">E-mail</dt>
          <dd>{demande.client.email}</dd>
          <dt className="text-zinc-500">Destination</dt>
          <dd>{demande.destination ?? 'aucune idée'}</dd>
          <dt className="text-zinc-500">Dates</dt>
          <dd>
            {jour(demande.dates.debut)} → {jour(demande.dates.fin)}, {demande.dates.nb_nuits} nuit{demande.dates.nb_nuits > 1 ? 's' : ''}
          </dd>
          <dt className="text-zinc-500">Voyageurs</dt>
          <dd>{voyageurs(demande.voyageurs)}</dd>
          <dt className="text-zinc-500">Budget annoncé</dt>
          <dd>{demande.budget_annonce ? `${euros(demande.budget_annonce.montant_cents)} pour le groupe` : 'non précisé'}</dd>
          <dt className="text-zinc-500">Envies</dt>
          <dd className="whitespace-pre-line">{demande.envies ?? '—'}</dd>
          <dt className="text-zinc-500">Contraintes</dt>
          <dd className="whitespace-pre-line">{demande.contraintes ?? '—'}</dd>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Fiche{fiche && ` (${ETAT_FICHE[fiche.etat]})`}</h2>
        {!fiche ? (
          <p className="mt-2 text-zinc-600">
            {dossier.statut === 'fiche_en_cours' ? 'Génération en cours…' : 'La fiche n’a pas encore été générée.'}
          </p>
        ) : (
          <>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
              <dt className="text-zinc-500">Envies</dt>
              <dd><Liste items={fiche.envies} /></dd>
              <dt className="text-zinc-500">Contraintes</dt>
              <dd><Liste items={fiche.contraintes} /></dd>
              <dt className="text-zinc-500">Points flous</dt>
              <dd><Liste items={fiche.points_flous} vide="aucun" /></dd>
              <dt className="text-zinc-500">Régimes</dt>
              <dd>{fiche.regimes.length ? fiche.regimes.map((r) => REGIME[r]).join(', ') : 'aucun'}</dd>
              <dt className="text-zinc-500">Mobilité</dt>
              <dd>{fiche.mobilite === 'reduite' ? 'réduite' : 'sans contrainte signalée'}</dd>
              <dt className="text-zinc-500">Niveau physique</dt>
              <dd>{fiche.niveau_physique ?? '—'}</dd>
              <dt className="text-zinc-500">Décision</dt>
              <dd>{fiche.decision ? DECISION[fiche.decision] : 'pas encore triée'}</dd>
              {fiche.validee_le && (
                <>
                  <dt className="text-zinc-500">Validée le</dt>
                  <dd>{instantParis(fiche.validee_le)}</dd>
                </>
              )}
            </dl>

            <h3 className="mt-8 font-semibold">Après l’entretien</h3>
            <p className="mt-1 text-sm text-zinc-600">Ces champs sont gardés si la fiche est régénérée.</p>
            <FormulaireCorrection
              dossierId={dossier.dossier_id}
              valeurs={{
                budget_reel_euros: fiche.budget_reel_cents === null ? '' : String(fiche.budget_reel_cents / 100),
                date_debut_fixe: fiche.dates_fixes.debut ?? '',
                date_fin_fixe: fiche.dates_fixes.fin ?? '',
                nb_nuits_fixe: fiche.dates_fixes.nb_nuits === null ? '' : String(fiche.dates_fixes.nb_nuits),
                notes_conseiller: fiche.notes_conseiller ?? '',
              }}
            />
          </>
        )}
      </section>

      {aTrier && boucles && fiche && (
        <PanneauTri
          dossierId={dossier.dossier_id}
          statut={dossier.statut as 'fiche_prete' | 'a_corriger'}
          boucles={boucles}
          pointsFlous={fiche.points_flous}
        />
      )}

      {peutDemanderBrouillon && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Proposition</h2>
          {ficheComplete ? (
            <div className="mt-3">
              <BoutonBrouillon dossierId={dossier.dossier_id} valideFiche={dossier.statut === 'entretien_fait'} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">Renseignez le budget réel et les dates fixes pour générer le brouillon.</p>
          )}
        </section>
      )}

      {dossier.propositions.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Propositions</h2>
          <ul className="mt-2 text-sm">
            {dossier.propositions.map((p) => (
              <li key={p.id}>
                <Link href={`/conseiller/propositions/${p.id}`} className="underline underline-offset-4">
                  v{p.version} · {STATUT_PROPOSITION[p.statut]}
                </Link>{' '}
                · {p.total_cents === null ? 'total à calculer' : euros(p.total_cents)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Historique</h2>
        <ol className="mt-2 flex flex-col gap-1 text-sm">
          {dossier.historique.map((h, i) => (
            <li key={i}>
              <span className="text-zinc-500">{instantParis(h.date)}</span> · {evenement(h)} ·{' '}
              {h.auteur_nom ?? 'système'}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function Liste({ items, vide = '—' }: { items: string[]; vide?: string }) {
  if (items.length === 0) return <>{vide}</>;
  return (
    <ul className="list-inside list-disc">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function voyageurs(tranches: DetailDossier['demande']['voyageurs']) {
  const adultes = tranches.filter((t) => t === 'adulte').length;
  const enfants = tranches.length - adultes;
  return [`${adultes} adulte${adultes > 1 ? 's' : ''}`, enfants && `${enfants} enfant${enfants > 1 ? 's' : ''}`].filter(Boolean).join(', ');
}

function evenement(h: DetailDossier['historique'][number]) {
  if (h.type !== 'statut') return h.type;
  const libelle = (s: string | null) =>
    s === null ? '—' : h.cible === 'dossier' ? (STATUT_DOSSIER[s as keyof typeof STATUT_DOSSIER] ?? s) : (STATUT_PROPOSITION[s as keyof typeof STATUT_PROPOSITION] ?? s);
  const prefixe = h.cible === 'proposition' ? 'Proposition : ' : '';
  return h.ancien_statut === null ? `${prefixe}${libelle(h.nouveau_statut)}` : `${prefixe}${libelle(h.ancien_statut)} → ${libelle(h.nouveau_statut)}`;
}
