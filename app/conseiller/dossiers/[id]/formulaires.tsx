'use client';

import { useActionState, useState } from 'react';
import { nuitsEntre } from '@/types/demande';
import { demanderBrouillonAction, enregistrerCorrection, entretienFait, relancer, type EtatCorrection } from './actions';

const champ = 'bo-champ';

export interface ValeursCorrection {
  budget_reel_euros: string;
  destination_fixe: string;
  date_debut_fixe: string;
  date_fin_fixe: string;
  notes_conseiller: string;
}

/**
 * Budget réel, destination, dates fixes et notes, saisis après l'entretien. Une régénération de la fiche ne les écrase pas.
 * Destination en texte libre ; les villes du catalogue sont rappelées, et une ville hors catalogue est signalée.
 * Vide, c'est celle de la demande.
 * Les nuits suivent les dates.
 */
export function FormulaireCorrection({ dossierId, valeurs, destinations, destinationDemande }: {
  dossierId: string;
  valeurs: ValeursCorrection;
  /** Villes du catalogue actif : rappelées sous le champ. */
  destinations: readonly string[];
  destinationDemande: string | null;
}) {
  const [etat, action, enCours] = useActionState<EtatCorrection, FormData>(enregistrerCorrection.bind(null, dossierId), {});
  const e = etat.erreurs ?? {};
  // après une erreur, la saisie est reprise ; après un enregistrement, les valeurs relues en base
  const v: ValeursCorrection = { ...valeurs, ...etat.valeurs };
  const erreur = (nom: string) =>
    e[nom] ? (
      <span id={`${nom}-erreur`} role="alert" className="text-sm text-brique-texte">
        {e[nom]}
      </span>
    ) : null;
  const decrit = (nom: string) => (e[nom] ? { 'aria-invalid': true, 'aria-describedby': `${nom}-erreur` } : {});

  return (
    // La clé remonte le formulaire quand les valeurs changent : defaultValue n'est lu qu'au montage.
    <form key={JSON.stringify(v)} action={action} noValidate className="mt-4 flex flex-col gap-4">
      <ChampsCorrection v={v} erreur={erreur} decrit={decrit} destinations={destinations} destinationDemande={destinationDemande} formulaire={e.formulaire} />
      <div className="flex items-center gap-4">
        <button type="submit" disabled={enCours} className="bo-btn-2">
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {etat.enregistre && !enCours && (
          <span role="status" className="text-sm text-encre">
            Correction enregistrée.
          </span>
        )}
      </div>
    </form>
  );
}

/** Champs du formulaire ; un composant à part pour que les nuits affichées repartent des valeurs à chaque remontage. */
function ChampsCorrection({ v, erreur, decrit, destinations, destinationDemande, formulaire }: {
  v: ValeursCorrection;
  erreur: (nom: string) => React.ReactNode;
  decrit: (nom: string) => object;
  destinations: readonly string[];
  destinationDemande: string | null;
  formulaire?: string;
}) {
  const [debut, setDebut] = useState(v.date_debut_fixe);
  const [fin, setFin] = useState(v.date_fin_fixe);
  const [destination, setDestination] = useState(v.destination_fixe);
  const nuits = nuitsEntre(debut, fin);
  // même comparaison que le brouillon (prestationsAutorisees) : sans accents ni casse
  const normaliser = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const saisie = destination.trim();
  const auCatalogue = saisie === '' || destinations.some((d) => normaliser(d) === normaliser(saisie));

  return (
    <>
      {formulaire && (
        <p role="alert" className="rounded-lg bg-brique-pale px-3 py-2 text-sm text-brique-texte">
          {formulaire}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Budget réel du groupe (€)</span>
          <input name="budget_reel_euros" type="number" min={1} step={1} inputMode="numeric" defaultValue={v.budget_reel_euros} className={champ} {...decrit('budget_reel_euros')} />
          {erreur('budget_reel_euros')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Destination</span>
          <input
            name="destination_fixe"
            maxLength={120}
            defaultValue={v.destination_fixe}
            onChange={(ev) => setDestination(ev.target.value)}
            placeholder={destinationDemande ? `Celle de la demande : ${destinationDemande}` : 'À choisir'}
            className={champ}
            aria-describedby="destination_fixe-aide"
            {...decrit('destination_fixe')}
          />
          <span id="destination_fixe-aide" className="text-xs text-encre-doux">
            {destinations.length > 0 && <>Au catalogue de l’agence : {destinations.join(' · ')}. </>}
            Vide : celle de la demande. Sans destination, pas de brouillon.
          </span>
          {!auCatalogue && (
            <span aria-live="polite" className="text-xs text-brique-texte">
              « {saisie} » n’est pas au catalogue : le brouillon ne trouvera aucune prestation.
            </span>
          )}
          {erreur('destination_fixe')}
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Départ fixé</span>
          <input name="date_debut_fixe" type="date" defaultValue={v.date_debut_fixe} onChange={(ev) => setDebut(ev.target.value)} className={champ} {...decrit('date_debut_fixe')} />
          {erreur('date_debut_fixe')}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Retour fixé</span>
          <input name="date_fin_fixe" type="date" defaultValue={v.date_fin_fixe} onChange={(ev) => setFin(ev.target.value)} className={champ} {...decrit('date_fin_fixe')} />
          {erreur('date_fin_fixe')}
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nuits</span>
          <p aria-live="polite" className="py-2 text-sm">
            {nuits === null || nuits < 0 ? <span className="text-encre-doux">selon les dates</span> : `${nuits} nuit${nuits > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notes de l’entretien</span>
        <textarea name="notes_conseiller" rows={4} defaultValue={v.notes_conseiller} className={champ} {...decrit('notes_conseiller')} />
        {erreur('notes_conseiller')}
      </label>
    </>
  );
}

export function BoutonRelancer({ dossierId }: { dossierId: string }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => relancer(dossierId), {});
  return (
    <form action={action} className="flex items-center gap-4">
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Relance…' : 'Relancer'}
      </button>
      {etat.erreur && (
        <span role="alert" className="text-sm text-brique-texte">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}

/** « Générer le brouillon » (E4.4). En entretien_fait, le clic valide aussi la fiche (dossier en_proposition). */
export function BoutonBrouillon({ dossierId, valideFiche }: { dossierId: string; valideFiche: boolean }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => demanderBrouillonAction(dossierId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Lancement…' : valideFiche ? 'Valider la fiche et générer le brouillon' : 'Générer le brouillon'}
      </button>
      {etat.erreur && !enCours && (
        <span role="alert" className="text-sm text-brique-texte">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}

/** « Entretien fait » (E7.3) : le rendez-vous a eu lieu, le dossier passe en entretien_fait. */
export function BoutonEntretienFait({ dossierId }: { dossierId: string }) {
  const [etat, action, enCours] = useActionState<{ erreur?: string }, FormData>(() => entretienFait(dossierId), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={enCours} className="bo-btn">
        {enCours ? 'Enregistrement…' : 'Entretien fait'}
      </button>
      {etat.erreur && !enCours && (
        <span role="alert" className="text-sm text-brique-texte">
          {etat.erreur}
        </span>
      )}
    </form>
  );
}
