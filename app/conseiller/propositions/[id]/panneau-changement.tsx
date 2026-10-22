'use client';

import { useActionState } from 'react';
import { changementDemande, type EtatChangement } from './changement';

/** Le client demande un changement (E6.1). Repliable : l'acceptation reste l'action principale d'une proposition envoyée. */
export function PanneauChangement({ propositionId, version }: { propositionId: string; version: number }) {
  const [etat, action, enCours] = useActionState<EtatChangement, FormData>(
    (e: EtatChangement, f: FormData) => changementDemande(propositionId, e, f),
    {},
  );
  return (
    <details className="bo-carte p-5" open={etat.erreur !== undefined}>
      <summary className="cursor-pointer font-semibold text-encre">Le client demande un changement</summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <p className="text-sm text-encre-doux">
          La version {version} reste telle qu’elle a été envoyée. Une version {version + 1} est créée à partir d’elle : ses lignes
          repartent « à vérifier », au prix actuel du catalogue.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Changement demandé</span>
          <textarea
            name="motif"
            rows={3}
            maxLength={1000}
            defaultValue={etat.motif}
            className="bo-champ"
            {...(etat.erreur ? { 'aria-invalid': true, 'aria-describedby': 'motif-erreur' } : {})}
          />
        </label>
        <button type="submit" disabled={enCours} className="bo-btn-2 self-start text-sm">
          {enCours ? 'Création…' : `Créer la version ${version + 1}`}
        </button>
        {etat.erreur && (
          <p id="motif-erreur" role="alert" className="text-sm text-brique-texte">
            {etat.erreur}
          </p>
        )}
      </form>
    </details>
  );
}
