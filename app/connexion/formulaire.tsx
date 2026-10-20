'use client';

import { useActionState } from 'react';
import { connecter } from './actions';

export function FormulaireConnexion({ suite, erreurInitiale }: { suite: string; erreurInitiale?: string }) {
  const [etat, action, enCours] = useActionState(connecter, { erreur: erreurInitiale });

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required className="bo-champ" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="bo-champ"
        />
      </label>
      {etat.erreur && (
        <p role="alert" className="rounded-[10px] bg-grenade-pale px-3 py-2 text-sm text-grenade">
          {etat.erreur}
        </p>
      )}
      <button type="submit" disabled={enCours} className="bo-btn mt-2 w-full">
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
