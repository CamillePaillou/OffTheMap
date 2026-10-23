import Link from 'next/link';
import type { ReactNode } from 'react';

/** Cadre des pages de connexion du compte client : une carte étroite sur la craie, et le suivi sans compte en dessous. */
export function CadreCompte({ titre, intro, children, pied }: { titre: string; intro: ReactNode; children: ReactNode; pied?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:py-16">
      <div className="panneau p-6 sm:p-8">
        <h1 className="text-3xl">{titre}</h1>
        <p className="mt-2 leading-relaxed text-encre-doux">{intro}</p>
        {children}
      </div>
      {pied && <div className="mt-6 flex flex-col gap-2 text-[15px]">{pied}</div>}
      <p className="mt-6 text-[15px] text-encre-doux">
        Pas besoin de compte pour savoir où en est votre voyage :{' '}
        <Link href="/suivi" className="font-semibold text-encre underline underline-offset-4">
          suivre avec mon numéro de dossier
        </Link>
        .
      </p>
    </main>
  );
}
