import type { Metadata } from 'next';
import { Suspense } from 'react';
import { exigerClient } from '@/lib/auth/client';
import { CadreCompte } from '../cadre';
import { FormulaireNouveauMotDePasse } from '../formulaires';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

// Après le lien de récupération (/compte/confirmer ouvre la session), ou depuis le compte.
export default function NouveauMotDePassePage() {
  return (
    <CadreCompte titre="Nouveau mot de passe" intro="Choisissez le mot de passe de votre espace.">
      <Suspense>
        <Formulaire />
      </Suspense>
    </CadreCompte>
  );
}

async function Formulaire() {
  const client = await exigerClient('/compte/nouveau-mot-de-passe');
  return (
    <>
      <p className="mt-4 text-[15px]">Pour {client.email}</p>
      <FormulaireNouveauMotDePasse />
    </>
  );
}
