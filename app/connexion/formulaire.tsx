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
        <input name="email" type="email" autoComplete="email" required className="rounded-lg border border-[#b7c7d3] bg-white px-3 py-2.5" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-lg border border-[#b7c7d3] bg-white px-3 py-2.5"
        />
      </label>
      {etat.erreur && (
        <p role="alert" className="rounded-lg border-l-4 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
          {etat.erreur}
        </p>
      )}
      <button type="submit" disabled={enCours} className="mt-2 rounded-lg bg-nuit px-4 py-2.5 font-bold text-white hover:bg-[#0a3a57] disabled:opacity-60">
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
