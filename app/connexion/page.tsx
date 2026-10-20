import type { Metadata } from 'next';
import Image from 'next/image';
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
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 md:grid-cols-2 md:py-16">
      <div className="panneau order-2 p-6 sm:p-8 md:order-1">
        <h1 className="text-3xl">Connexion conseiller</h1>
        <p className="mt-2 text-doux">Accès réservé à l’équipe DÉTOUR.</p>
        <Suspense>
          <Formulaire searchParams={searchParams} />
        </Suspense>
      </div>
      <div className="order-1 md:order-2">
        <Image src="/detour/nantes.jpg" alt="" width={600} height={420} className="hidden aspect-[4/3] w-full rounded-2xl object-cover md:block" />
        <ul className="mt-5 flex flex-col gap-2 text-doux">
          <li>Trier les nouvelles demandes et leurs fiches.</li>
          <li>Vérifier chaque prix avant l’envoi.</li>
          <li>Suivre les réponses des clients.</li>
        </ul>
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
