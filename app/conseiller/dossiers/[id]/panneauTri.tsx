'use client';

import { useActionState } from 'react';
import { CHAMPS_CORRIGEABLES, LIBELLES_CHAMPS, REGLES_CORRECTION } from '@/types/correction';
import { demanderUneCorrection, trier, type EtatTri } from './tri';

const champ = 'rounded border border-zinc-300 px-3 py-2';

interface Props {
  dossierId: string;
  statut: 'fiche_prete' | 'a_corriger';
  /** Corrections déjà demandées et lien encore ouvert (E1.2). */
  boucles: { faites: number; lienOuvertJusquau: string | null };
  /** Points flous de la fiche : point de départ du motif, que le conseiller relit et réécrit. */
  pointsFlous: string[];
}

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso));

/** Tri d'une demande (E3.1) : validée, à corriger (avec le lien de correction pour le client) ou refusée. */
export function PanneauTri({ dossierId, statut, boucles, pointsFlous }: Props) {
  const [etatValider, valider, validationEnCours] = useActionState<EtatTri, FormData>(trier.bind(null, dossierId, 'validee'), {});
  const [etatRefus, refuser, refusEnCours] = useActionState<EtatTri, FormData>(trier.bind(null, dossierId, 'refusee'), {});
  const [etatLien, corriger, lienEnCours] = useActionState<EtatTri, FormData>(demanderUneCorrection.bind(null, dossierId), {});

  const bouclesRestantes = REGLES_CORRECTION.bouclesMax - boucles.faites;
  const peutCorriger = bouclesRestantes > 0 && !boucles.lienOuvertJusquau;
  const v = etatLien.valeurs ?? {};
  const e = etatLien.erreurs ?? {};
  const alerte = (texte?: string) =>
    texte ? (
      <p role="alert" className="text-sm text-red-700">
        {texte}
      </p>
    ) : null;

  return (
    <section className="mt-10 rounded border border-zinc-200 p-5">
      <h2 className="text-lg font-semibold">{statut === 'fiche_prete' ? 'Trier la demande' : 'Demande à corriger'}</h2>
      {statut === 'a_corriger' && (
        <p className="mt-1 text-sm text-zinc-600">
          {boucles.lienOuvertJusquau
            ? `Lien de correction envoyé, valable jusqu’au ${date(boucles.lienOuvertJusquau)}. Si le client répond autrement (téléphone, mail), reportez sa réponse dans la fiche puis validez la demande.`
            : 'Aucun lien de correction en cours.'}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-6">
        <form action={valider} className="flex flex-col gap-2">
          <button type="submit" disabled={validationEnCours} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">
            {validationEnCours ? 'Enregistrement…' : 'Valider'}
          </button>
          {alerte(etatValider.erreurs?.formulaire)}
        </form>

        <form action={refuser} className="flex flex-col gap-2">
          <button type="submit" disabled={refusEnCours} className="self-start rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50">
            {refusEnCours ? 'Enregistrement…' : 'Refuser'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input name="confirmer_refus" type="checkbox" aria-describedby={etatRefus.erreurs?.confirmer_refus ? 'refus-erreur' : undefined} />
            Je confirme : le refus est définitif
          </label>
          {etatRefus.erreurs?.confirmer_refus && (
            <p id="refus-erreur" role="alert" className="text-sm text-red-700">
              {etatRefus.erreurs.confirmer_refus}
            </p>
          )}
          {alerte(etatRefus.erreurs?.formulaire)}
        </form>
      </div>

      {etatLien.lien ? (
        <div role="status" className="mt-6 flex flex-col gap-2 rounded border border-green-300 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-900">Lien de correction créé, valable jusqu’au {date(etatLien.lien.expireLe)}.</p>
          <p className="text-green-900">Il n’est affiché qu’ici : envoyez-le maintenant. Relisez le mail avant de l’envoyer.</p>
          <a href={etatLien.lien.mailto} className="self-start rounded bg-zinc-900 px-4 py-2 text-white">
            Ouvrir le mail dans ma messagerie
          </a>
          <input readOnly value={etatLien.lien.url} aria-label="Lien de correction" className={`${champ} font-mono text-xs`} onFocus={(ev) => ev.currentTarget.select()} />
        </div>
      ) : peutCorriger ? (
        <details open={Object.keys(e).length > 0} className="mt-6">
          <summary className="cursor-pointer font-medium">
            {statut === 'fiche_prete' ? 'À corriger : demander des précisions au client' : 'Envoyer un lien de correction'}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({bouclesRestantes} {bouclesRestantes > 1 ? 'corrections possibles' : 'correction possible'})
            </span>
          </summary>
          <form key={JSON.stringify(v)} action={corriger} noValidate className="mt-4 flex flex-col gap-4">
            {alerte(e.formulaire)}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Points à revoir par le client</legend>
              {CHAMPS_CORRIGEABLES.map((c) => (
                <div key={c} className="grid items-center gap-2 sm:grid-cols-[14rem_1fr]">
                  <label className="flex items-center gap-2 text-sm">
                    <input name="champs" value={c} type="checkbox" defaultChecked={v[`champ_${c}`] === 'on'} />
                    {LIBELLES_CHAMPS[c]}
                  </label>
                  <input
                    name={`commentaire_${c}`}
                    maxLength={REGLES_CORRECTION.commentaireMax}
                    defaultValue={v[`commentaire_${c}`]}
                    placeholder="Petit commentaire pour le client (facultatif)"
                    aria-label={`Commentaire sur : ${LIBELLES_CHAMPS[c]}`}
                    className={`${champ} text-sm`}
                  />
                </div>
              ))}
              {alerte(e.champs)}
              {alerte(e.commentaires)}
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Message au client</span>
              <span className="text-xs text-zinc-500">Lu par le client dans le mail et sur le formulaire : rien d’interne.</span>
              <textarea
                name="motif"
                rows={4}
                maxLength={REGLES_CORRECTION.motifMax}
                defaultValue={v.motif ?? pointsFlous.join('\n')}
                className={champ}
              />
              {alerte(e.motif)}
            </label>
            <button type="submit" disabled={lienEnCours} className="self-start rounded bg-amber-600 px-4 py-2 text-white disabled:opacity-50">
              {lienEnCours ? 'Création du lien…' : statut === 'fiche_prete' ? 'Passer à corriger et créer le lien' : 'Créer le lien'}
            </button>
          </form>
        </details>
      ) : (
        bouclesRestantes <= 0 && (
          <p className="mt-6 text-sm text-zinc-600">
            Deux corrections ont déjà été demandées : appelez le client, ou validez ou refusez la demande.
          </p>
        )
      )}
    </section>
  );
}
