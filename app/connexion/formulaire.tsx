'use client';

import { useActionState } from 'react';
import { connecter } from './actions';

export function FormulaireConnexion({ suite, erreurInitiale }: { suite: string; erreurInitiale?: string }) {
  const [etat, action, enCours] = useActionState(connecter, { erreur: erreurInitiale });

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="suite" value={suite} />
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Adresse e-mail</span>
        <input name="email" type="email" autoComplete="email" required className="rounded border border-zinc-300 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-zinc-300 px-3 py-2"
        />
      </label>
      {etat.erreur && (
        <p role="alert" className="text-sm text-red-700">
          {etat.erreur}
        </p>
      )}
      <button type="submit" disabled={enCours} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60">
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
