'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import {
  changerMotDePasse,
  connecterClient,
  demanderNouveauMotDePasse,
  inscrire,
  renvoyerConfirmation,
  repondreEnLigne,
  type EtatCompte,
  type EtatReponseEnLigne,
} from './actions';

// Formulaires de l'espace client : même champ et mêmes boutons que le formulaire de demande (site public).
const champ = 'rounded-[10px] border-[1.5px] border-ballast bg-carte px-3 py-2.5 hover:border-encre';

function Erreur({ texte }: { texte?: string }) {
  if (!texte) return null;
  return (
    <p role="alert" className="rounded-lg border-l-4 border-brique bg-brique-pale px-3 py-2 text-sm text-brique-texte">
      {texte}
    </p>
  );
}

function Envoye({ texte }: { texte: string }) {
  return (
    <p role="status" className="rounded-lg border-l-4 border-encre bg-ciel-pale px-3 py-3 text-encre">
      {texte}
    </p>
  );
}

function ChampEmail({ defaut, aide }: { defaut?: string; aide?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">Adresse e-mail</span>
      <input name="email" type="email" autoComplete="email" required defaultValue={defaut} className={champ} aria-describedby={aide ? 'aide-email' : undefined} />
      {aide && <span id="aide-email" className="text-sm text-encre-doux">{aide}</span>}
    </label>
  );
}

function ChampsNouveauMotDePasse() {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mot de passe</span>
        <input name="motDePasse" type="password" autoComplete="new-password" required minLength={8} className={champ} aria-describedby="aide-mdp" />
        <span id="aide-mdp" className="text-sm text-encre-doux">8 caractères au moins.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Le même, encore une fois</span>
        <input name="confirmation" type="password" autoComplete="new-password" required minLength={8} className={champ} />
      </label>
    </>
  );
}

export function FormulaireInscription({ emailDemande }: { emailDemande?: string }) {
  const [etat, action, enCours] = useActionState<EtatCompte, FormData>(inscrire, { email: emailDemande });
  if (etat.envoye) return <div className="mt-6"><Envoye texte={etat.envoye} /></div>;
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <ChampEmail defaut={etat.email} aide="Celle de votre demande : c’est elle qui relie vos demandes à votre espace." />
      <ChampsNouveauMotDePasse />
      <Erreur texte={etat.erreur} />
      <button type="submit" disabled={enCours} className="btn-principal mt-2 w-full">
        {enCours ? 'Création…' : 'Créer mon espace'}
      </button>
    </form>
  );
}

export function FormulaireConnexionClient({ suite, erreurInitiale }: { suite: string; erreurInitiale?: string }) {
  const [etat, action, enCours] = useActionState<EtatCompte, FormData>(connecterClient, { erreur: erreurInitiale });
  const nonConfirme = etat.erreur?.startsWith('Confirmez d’abord');
  return (
    <>
      <form action={action} className="mt-6 flex flex-col gap-4">
        <input type="hidden" name="suite" value={suite} />
        <ChampEmail defaut={etat.email} />
        <label className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3 text-sm font-medium">
            Mot de passe
            <Link href="/compte/mot-de-passe-oublie" className="font-normal underline underline-offset-4">
              Mot de passe oublié ?
            </Link>
          </span>
          <input name="motDePasse" type="password" autoComplete="current-password" required className={champ} />
        </label>
        <Erreur texte={etat.erreur} />
        <button type="submit" disabled={enCours} className="btn-principal mt-2 w-full">
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      {nonConfirme && <RenvoyerConfirmation email={etat.email} />}
    </>
  );
}

function RenvoyerConfirmation({ email }: { email?: string }) {
  const [etat, action, enCours] = useActionState<EtatCompte, FormData>(renvoyerConfirmation, {});
  if (etat.envoye) return <div className="mt-4"><Envoye texte={etat.envoye} /></div>;
  return (
    <form action={action} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="email" value={email ?? ''} />
      <button type="submit" disabled={enCours} className="btn-second self-start">
        {enCours ? 'Envoi…' : 'Renvoyer l’e-mail de confirmation'}
      </button>
      <Erreur texte={etat.erreur} />
    </form>
  );
}

export function FormulaireMotDePasseOublie() {
  const [etat, action, enCours] = useActionState<EtatCompte, FormData>(demanderNouveauMotDePasse, {});
  if (etat.envoye) return <div className="mt-6"><Envoye texte={etat.envoye} /></div>;
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <ChampEmail defaut={etat.email} />
      <Erreur texte={etat.erreur} />
      <button type="submit" disabled={enCours} className="btn-principal mt-2 w-full">
        {enCours ? 'Envoi…' : 'Recevoir un lien'}
      </button>
    </form>
  );
}

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatCompte, FormData>(changerMotDePasse, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <ChampsNouveauMotDePasse />
      <Erreur texte={etat.erreur} />
      <button type="submit" disabled={enCours} className="btn-principal mt-2 w-full">
        {enCours ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
      </button>
    </form>
  );
}

/** Réponse en ligne : accepter (avec une case à cocher) ou demander un changement (avec un message). */
export function FormulaireReponse({ propositionId, conseiller }: { propositionId: string; conseiller: string }) {
  const [choix, setChoix] = useState<'acceptee' | 'changement'>('acceptee');
  const [etat, action, enCours] = useActionState<EtatReponseEnLigne, FormData>(
    (e: EtatReponseEnLigne, f: FormData) => repondreEnLigne(propositionId, e, f),
    {},
  );
  const option = (valeur: 'acceptee' | 'changement', libelle: string) => (
    <label className={`flex flex-1 cursor-pointer items-center gap-2 rounded-[10px] border-[1.5px] px-3 py-2.5 ${choix === valeur ? 'border-encre bg-ciel-pale' : 'border-ballast'}`}>
      <input type="radio" name="type" value={valeur} checked={choix === valeur} onChange={() => setChoix(valeur)} />
      {libelle}
    </label>
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 sm:flex-row">
        <legend className="sr-only">Votre réponse</legend>
        {option('acceptee', 'J’accepte la proposition')}
        {option('changement', 'Je voudrais un changement')}
      </fieldset>
      {choix === 'acceptee' ? (
        <label className="flex items-start gap-2">
          <input name="confirmer" type="checkbox" className="mt-1" />
          <span>J’ai lu le programme et les prix. {conseiller} m’indiquera comment verser le dépôt de garantie.</span>
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Ce que vous voulez changer</span>
          <textarea name="message" rows={4} maxLength={1000} required className={champ} placeholder="Par exemple : un hôtel plus près de la gare, ou partir le samedi matin." />
        </label>
      )}
      <Erreur texte={etat.erreur} />
      <button type="submit" disabled={enCours} className="btn-principal self-start">
        {enCours ? 'Envoi…' : choix === 'acceptee' ? 'Envoyer mon acceptation' : 'Envoyer ma demande de changement'}
      </button>
    </form>
  );
}
