import type { Metadata } from 'next';
import { Suspense } from 'react';
import { suiteSure } from '@/lib/auth/redirection';
import { FormulaireConnexion } from './formulaire';

export const metadata: Metadata = { title: 'Connexion conseiller' };

const MESSAGES: Record<string, string> = {
  profil: 'Ce compte n’a pas de profil conseiller.',
};

// Connexion du conseiller (E0.11) : e-mail et mot de passe Supabase Auth.
export default function ConnexionPage({ searchParams }: PageProps<'/connexion'>) {
  return (
    <main className="bo flex flex-1 items-center justify-center px-4 py-12">
      <div className="bo-bloc bo-entre w-full max-w-sm p-7 sm:p-8">
        <h1 className="text-2xl">Espace conseiller</h1>
        <p className="mt-1.5 text-ardoise">Connectez-vous pour retrouver vos dossiers.</p>
        <Suspense>
          <Formulaire searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Formulaire({ searchParams }: Pick<PageProps<'/connexion'>, 'searchParams'>) {
  const { suite, erreur } = await searchParams;
  const texte = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  const code = texte(erreur);
  return (
    <FormulaireConnexion suite={suiteSure(texte(suite))} erreurInitiale={code ? MESSAGES[code] : undefined} />
  );
}
