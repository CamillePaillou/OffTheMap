import { Suspense } from 'react';
import { suiteSure } from '@/lib/auth/redirection';
import { FormulaireConnexion } from './formulaire';

const MESSAGES: Record<string, string> = {
  profil: 'Ce compte n’a pas de profil conseiller.',
};

// Connexion du conseiller (E0.11) : e-mail et mot de passe Supabase Auth.
export default function ConnexionPage({ searchParams }: PageProps<'/connexion'>) {
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">Connexion conseiller</h1>
      <Suspense>
        <Formulaire searchParams={searchParams} />
      </Suspense>
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
