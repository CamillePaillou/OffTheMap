'use client';

import { useActionState } from 'react';
import { CHAMPS_CORRIGEABLES, LIBELLES_CHAMPS, MOTIFS_TYPES, REGLES_CORRECTION } from '@/types/correction';
import { CarteMail } from '../../_composants/carte-mail';
import { demanderUneCorrection, trier, type EtatTri } from './tri';

const champ = 'bo-champ';

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
      <p role="alert" className="text-sm text-grenade">
        {texte}
      </p>
    ) : null;

  return (
    <section className="mt-1">
      {/* le titre (« Trier la demande ») est celui du bloc « Maintenant » de la fiche */}
      {statut === 'fiche_prete' && <p className="text-sm text-[#3d4570]">Relisez la fiche, puis validez, demandez une précision au client ou refusez.</p>}
      {statut === 'a_corriger' && (
        <p className="mt-1 text-sm text-ardoise">
          {boucles.lienOuvertJusquau
            ? `Lien de correction envoyé, valable jusqu’au ${date(boucles.lienOuvertJusquau)}. Si le client répond autrement (téléphone, mail), reportez sa réponse dans la fiche puis validez la demande.`
            : 'Aucun lien de correction en cours.'}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <form action={valider} className="flex flex-col gap-2">
          <button type="submit" disabled={validationEnCours} className="bo-btn">
            {validationEnCours ? 'Enregistrement…' : 'Valider'}
          </button>
          {alerte(etatValider.erreurs?.formulaire)}
        </form>

        <form action={refuser} className="flex flex-col gap-2">
          <button type="submit" disabled={refusEnCours} className="bo-btn-2 self-start text-grenade!">
            {refusEnCours ? 'Enregistrement…' : 'Refuser'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input name="confirmer_refus" type="checkbox" aria-describedby={etatRefus.erreurs?.confirmer_refus ? 'refus-erreur' : undefined} />
            Je confirme : le refus est définitif
          </label>
          {etatRefus.erreurs?.confirmer_refus && (
            <p id="refus-erreur" role="alert" className="text-sm text-grenade">
              {etatRefus.erreurs.confirmer_refus}
            </p>
          )}
          {alerte(etatRefus.erreurs?.formulaire)}
        </form>
      </div>

      {etatLien.lien ? (
        <div role="status" className="mt-5 flex flex-col gap-2 rounded-[14px] bg-white p-4 text-sm">
          <p className="font-medium text-sauge">Lien de correction créé, valable jusqu’au {date(etatLien.lien.expireLe)}.</p>
          <p className="text-sauge">Il n’est affiché qu’ici : envoyez-le maintenant. Relisez le mail avant de l’envoyer.</p>
          <CarteMail
            dossierId={dossierId}
            propositionId={null}
            modele="a_corriger"
            titre="Mail « Demande à corriger »"
            sujet={etatLien.lien.sujet}
            corps={etatLien.lien.corps}
            mailto={etatLien.lien.mailto}
            ouvert
          />
          <input readOnly value={etatLien.lien.url} aria-label="Lien de correction" className={`${champ} font-mono text-xs`} onFocus={(ev) => ev.currentTarget.select()} />
        </div>
      ) : peutCorriger ? (
        <details open={Object.keys(e).length > 0} className="mt-5 rounded-[14px] bg-white/70 px-4 py-3">
          <summary className="cursor-pointer font-semibold text-encre">
            {statut === 'fiche_prete' ? 'À corriger : demander des précisions au client' : 'Envoyer un lien de correction'}
            <span className="ml-2 text-sm font-normal text-ardoise">
              ({bouclesRestantes} {bouclesRestantes > 1 ? 'corrections possibles' : 'correction possible'})
            </span>
          </summary>
          <form key={JSON.stringify(v)} action={corriger} noValidate className="mt-4 flex flex-col gap-4">
            {alerte(e.formulaire)}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Points à revoir par le client</legend>
              {CHAMPS_CORRIGEABLES.map((c) => (
                <div key={c} className="grid items-center gap-1.5 rounded-[10px] p-2 transition-colors has-[:checked]:bg-white sm:grid-cols-[13rem_1fr]">
                  <label className="flex items-center gap-2 text-sm">
                    <input name="champs" value={c} type="checkbox" defaultChecked={v[`champ_${c}`] === 'on'} />
                    {LIBELLES_CHAMPS[c]}
                  </label>
                  <input
                    name={`commentaire_${c}`}
                    list={`motifs-${c}`}
                    maxLength={REGLES_CORRECTION.commentaireMax}
                    defaultValue={v[`commentaire_${c}`]}
                    placeholder="Pourquoi (facultatif) : motif type ou texte libre"
                    aria-label={`Commentaire sur : ${LIBELLES_CHAMPS[c]}`}
                    className={`${champ} text-sm`}
                  />
                  {/* motifs types (E3.3) : proposés à la saisie, modifiables */}
                  <datalist id={`motifs-${c}`}>
                    {MOTIFS_TYPES[c].map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              ))}
              {alerte(e.champs)}
              {alerte(e.commentaires)}
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Message au client</span>
              <span className="text-xs text-ardoise">Lu par le client dans le mail et sur le formulaire : rien d’interne.</span>
              <textarea
                name="motif"
                rows={4}
                maxLength={REGLES_CORRECTION.motifMax}
                defaultValue={v.motif ?? pointsFlous.join('\n')}
                className={champ}
              />
              {alerte(e.motif)}
            </label>
            <button type="submit" disabled={lienEnCours} className="bo-btn self-start">
              {lienEnCours ? 'Création du lien…' : statut === 'fiche_prete' ? 'Passer à corriger et créer le lien' : 'Créer le lien'}
            </button>
          </form>
        </details>
      ) : (
        bouclesRestantes <= 0 && (
          <p className="mt-6 text-sm text-ardoise">
            Deux corrections ont déjà été demandées : appelez le client, ou validez ou refusez la demande.
          </p>
        )
      )}
    </section>
  );
}
