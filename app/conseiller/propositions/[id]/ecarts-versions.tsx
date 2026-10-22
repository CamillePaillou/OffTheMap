import type { CotePrestation, EcartPrestation, EcartsVersions } from '@/src/domain/proposition/ecartsVersions';
import { euros } from '@/src/domain/ecartPrix';

const CHANGEMENT = { dates: 'dates', participants: 'participants', prix: 'prix' } as const;

/** AAAA-MM-JJ → « 7 nov. », sans décalage de fuseau. */
const jourCourt = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** −10,00 € / +192,00 € / 0,00 € */
const ecart = (cents: number) => (cents < 0 ? `−${euros(-cents)}` : euros(cents, true));

function Cote({ c, type }: { c: CotePrestation | null; type: EcartPrestation['type'] }) {
  if (!c) return <span className="text-encre-doux">—</span>;
  const nuits = type === 'hebergement' ? ` (${c.dates.length} nuit${c.dates.length > 1 ? 's' : ''})` : '';
  return (
    <>
      <span className="block">{c.dates.map(jourCourt).join(', ')}{nuits}</span>
      <span className="block text-encre-doux">
        {c.participants.join(' ou ')} pers. · {c.prix_unitaires_cents.map((p) => euros(p)).join(' / ')}
        {c.prix_a_verifier && ' (à vérifier)'}
      </span>
    </>
  );
}

// Ce qui a changé depuis la version précédente (E6.2) : calculé par le code (src/domain/proposition/ecartsVersions.ts).
export function EcartsVersionsCarte({ e, children }: { e: EcartsVersions; children?: React.ReactNode }) {
  return (
    <section aria-labelledby="titre-ecarts" className="bo-carte mt-6 p-5 sm:p-6">
      <h2 id="titre-ecarts" className="text-2xl">Ce qui a changé depuis la version {e.version_avant}</h2>
      <p className="mt-2 text-sm">
        Total : {euros(e.total_avant_cents)} → <strong>{euros(e.total_apres_cents)}</strong>{' '}
        <span className="font-semibold">({ecart(e.delta_total_cents)})</span>
      </p>
      {e.prix_a_verifier && (
        <p className="mt-1 text-sm text-encre">
          Certains prix de cette version sont encore ceux du catalogue : les écarts évolueront à mesure que les tarifs sont confirmés.
        </p>
      )}

      {e.prestations.length === 0 ? (
        <p className="mt-4 text-sm text-encre-doux">Aucune prestation n’a changé.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">Écarts par prestation entre les versions {e.version_avant} et {e.version_apres}</caption>
            <thead className="bg-craie text-encre-doux">
              <tr>
                <th className="px-3 py-2 font-semibold">Prestation</th>
                <th className="px-3 py-2 font-semibold">Version {e.version_avant}</th>
                <th className="px-3 py-2 font-semibold">Version {e.version_apres}</th>
                <th className="px-3 py-2 text-right font-semibold">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trait">
              {e.prestations.map((p) => (
                <tr key={p.prestation_id} className="align-top">
                  <td className="px-3 py-3">
                    <span className="font-semibold">{p.nom}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {p.nature === 'modifiee'
                        ? p.changements.map((c) => (
                            <span key={c} className="rounded-full bg-ciel-pale px-2 py-0.5 text-xs font-semibold text-encre">{CHANGEMENT[c]}</span>
                          ))
                        : (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.nature === 'ajoutee' ? 'bg-ciel-pale text-encre' : 'bg-brique-pale text-brique-texte'}`}>
                              {p.nature === 'ajoutee' ? 'ajoutée' : 'retirée'}
                            </span>
                          )}
                    </span>
                  </td>
                  <td className="px-3 py-3"><Cote c={p.avant} type={p.type} /></td>
                  <td className="px-3 py-3"><Cote c={p.apres} type={p.type} /></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{ecart(p.delta_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {e.inchangees > 0 && (
        <p className="mt-3 text-sm text-encre-doux">
          {e.inchangees} prestation{e.inchangees > 1 ? 's' : ''} inchangée{e.inchangees > 1 ? 's' : ''}.
        </p>
      )}
      {children /* E6.3 : résumé en mots pour le client */}
    </section>
  );
}
