import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { exigerConseiller } from '@/lib/auth/conseiller';
import { ecartPrix, euros } from '@/src/domain/ecartPrix';
import { DossiersSupabase } from '@/src/infrastructure/db/dossiersSupabase';
import { PropositionsSupabase } from '@/src/infrastructure/db/propositionsSupabase';
import { Fil } from '../../../../_composants/fil';
import { dateDeVerification, jourCourt } from '../../../../_composants/libelles';
import { Ecart } from '../../../../_composants/ecart';
import { BoutonReverifier } from './bouton-reverifier';
import { estRejeu, PREFIXE_REJEU } from '@/src/domain/verification/rejeu';
import { modeAgent } from '@/src/infrastructure/llm';

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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-encre-doux">Chargement…</p>}>
        <Contenu params={params} />
      </Suspense>
    </main>
  );
}

async function Contenu({ params }: Pick<Props, 'params'>) {
  const { id, ligneId } = await params;
  await exigerConseiller(`/conseiller/propositions/${id}/lignes/${ligneId}`);

  const lecture = new PropositionsSupabase();
  const proposition = await lecture.proposition(id);
  const ligne = proposition?.lignes.find((l) => l.id === ligneId);
  if (!proposition || !ligne) notFound();
  const [verification, dossier] = await Promise.all([lecture.verificationDeLigne(ligneId), new DossiersSupabase().detail(proposition.dossier_id)]);
  const ecart = verification ? ecartPrix(ligne, verification) : null;
  const STATUT_VERIF = { ok: 'disponible', indisponible: 'indisponible', echec: 'échec de la vérification' } as const;
  // E11.3 : le mode rejeu est toujours annoncé, avant de vérifier comme sur le résultat
  const modeRejeu = (() => { try { return modeAgent(process.env) === 'rejeu'; } catch { return false; } })();
  const rejouee = estRejeu(verification?.modele);

  return (
    <>
      <Fil
        etapes={[
          { libelle: 'Dossiers', href: '/conseiller' },
          { libelle: dossier?.demande.client.nom ?? 'Dossier', href: `/conseiller/dossiers/${proposition.dossier_id}` },
          { libelle: `Proposition v${proposition.version}`, href: `/conseiller/propositions/${id}` },
          { libelle: ligne.prestation.nom },
        ]}
      />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-trait pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl">{ligne.prestation.nom}</h1>
          <p className="mt-1 text-encre-doux">
            {jourCourt(ligne.date)} · {ligne.participants} participant{ligne.participants > 1 ? 's' : ''} · réf. {ligne.prestation.id}
          </p>
        </div>
        <BoutonReverifier propositionId={id} ligneId={ligne.id} deja={verification !== null} />
      </div>

      {modeRejeu && (
        <p role="status" className="mt-6 rounded-[14px] border-l-4 border-encre bg-ciel-pale px-4 py-3 text-sm text-encre">
          <span className="bo-puce mr-2 bg-encre text-craie">Rejeu</span>
          Agent en mode rejeu (démonstration sans OpenRouter) : les réponses du modèle sont rejouées depuis une vérification enregistrée.
          Le prestataire, lui, est interrogé en direct, et le programme contrôle tout comme d’habitude.
        </p>
      )}

      {!verification ? (
        <div className="bo-carte mt-8 p-6">
          <h2 className="text-xl">Pas encore vérifiée</h2>
          <p className="mt-2 max-w-2xl text-encre-doux">
            L’agent interroge le prestataire et compare son prix à celui de la proposition. Le résultat, la réponse du serveur et chaque étape de
            l’agent s’afficheront ici.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Chiffre titre="Prix proposé" valeur={euros(ligne.prix_unitaire_catalogue_cents)} detail="par personne" />
            <Chiffre
              titre="Prix revérifié"
              valeur={verification.prix_unitaire_cents === null ? 'non obtenu' : euros(verification.prix_unitaire_cents)}
              detail={`par personne, vérifié ${dateDeVerification(verification.le)}`}
              accent
            />
            <Chiffre titre="Écart par personne" valeur={<Ecart ecart={ecart} />} />
            <Chiffre titre="Écart sur la ligne" valeur={<Ecart ecart={ecart} total />} detail={`${ligne.participants} participant${ligne.participants > 1 ? 's' : ''}`} />
          </dl>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex flex-col gap-6">
              {rejouee && (
                <p className="bo-carte border-l-4 border-encre p-4 text-sm">
                  <span className="bo-puce mr-2 bg-encre text-craie">Rejeu</span>
                  Vérification faite en rejeu : les réponses du modèle ({verification.modele.slice(PREFIXE_REJEU.length)}) viennent d’un
                  enregistrement ; prix et places viennent du prestataire, interrogé en direct.
                </p>
              )}
              {verification.resume && (
                <blockquote className="bo-carte p-5 leading-relaxed">
                  <p className="text-sm text-encre-doux">Conclusion de l’agent</p>
                  <p className="mt-1">« {verification.resume} »</p>
                </blockquote>
              )}

              <section aria-labelledby="titre-trace" className="bo-carte overflow-x-auto">
                <h2 id="titre-trace" className="px-5 pt-5 text-xl">
                  Étapes de l’agent
                </h2>
                <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-craie text-encre-doux">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">Tour</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Appel</th>
                      <th scope="col" className="px-4 py-2 font-semibold">Décision du code</th>
                      <th scope="col" className="px-4 py-2 font-semibold">HTTP</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Durée</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-trait">
                    {verification.trace.map((t) => (
                      <tr key={t.numero} className="align-top">
                        <td className="px-4 py-2">{t.numero}</td>
                        <td className="px-4 py-2 text-xs tabular-nums break-all">
                          {t.appel ? `${t.appel.nom}(${JSON.stringify(t.appel.arguments)})` : `conclusion : ${JSON.stringify(t.conclusion)}`}
                        </td>
                        <td className="px-4 py-2">
                          {t.decision.statut}
                          {t.decision.raison && ` : ${t.decision.raison}`}
                          {t.decision.ecarts.map((e) => (
                            <span key={e.champ} className="block text-xs text-brique-texte">
                              {e.champ} : annoncé {String(e.annonce)}, serveur {e.serveur === null ? '—' : String(e.serveur)}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-2">{t.http_statut ?? (t.appel ? 'aucune réponse' : '—')}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right">{t.duree_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <details className="bo-carte p-5">
                <summary className="cursor-pointer font-semibold text-encre">Réponse brute du serveur</summary>
                {verification.reponse_serveur == null ? (
                  <p className="mt-3 text-encre-doux">Aucune réponse : le serveur n’a pas répondu.</p>
                ) : (
                  <pre className="mt-3 overflow-x-auto rounded-lg bg-craie p-4 text-xs">{JSON.stringify(verification.reponse_serveur, null, 2)}</pre>
                )}
              </details>
            </div>

            <aside aria-label="Détails de la vérification" className="bo-carte p-5 text-sm">
              <h2 className="text-lg">Vérification</h2>
              <dl className="mt-3 flex flex-col divide-y divide-trait">
                <Info terme="Résultat" valeur={STATUT_VERIF[verification.statut]} />
                <Info terme="Places restantes" valeur={verification.places_restantes ?? '—'} />
                <Info terme="Arrêt" valeur={ARRETS[verification.arret]} />
                <Info terme="Tours" valeur={verification.nb_tours} />
                <Info terme="Modèle" valeur={verification.modele} />
                <Info terme="Demandée par" valeur={verification.demandee_par} />
                <Info terme="Le" valeur={new Date(verification.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })} />
              </dl>
            </aside>
          </div>
        </>
      )}
    </>
  );
}

function Info({ terme, valeur }: { terme: string; valeur: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-encre-doux">{terme}</dt>
      <dd className="text-right font-semibold break-all">{valeur}</dd>
    </div>
  );
}

function Chiffre({ titre, valeur, detail, accent = false }: { titre: string; valeur: React.ReactNode; detail?: string; accent?: boolean }) {
  return (
    <div className={`bo-carte p-4 ${accent ? '' : ''}`}>
      <dt className="text-sm text-encre-doux">{titre}</dt>
      <dd className="mt-1 font-titre text-2xl font-extrabold tracking-[-0.025em] text-encre">{valeur}</dd>
      {detail && <dd className="text-sm text-encre-doux">{detail}</dd>}
    </div>
  );
}
