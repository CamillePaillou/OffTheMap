'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './logo';

/** Pied de page : complet sur le site public, réduit à une ligne dans l'espace conseiller (un outil de travail). */
export function PiedDePage() {
  const chemin = usePathname();
  return chemin.startsWith('/conseiller') || chemin.startsWith('/connexion') ? <PiedDePageReduit /> : <PiedDePagePublic />;
}

/** Une ligne : sert aussi de repli au prérendu, avant que le chemin soit connu. */
export function PiedDePageReduit() {
  return (
    <footer className="border-t border-trait bg-craie px-4 py-3 text-center text-xs text-encre-doux print:hidden">
      DÉTOUR · Projet pédagogique Off the Map. Agence, prestataires et prix fictifs.
    </footer>
  );
}

/** Pied de page public : aplat encre, logo en négatif, signature de la marque. */
function PiedDePagePublic() {
  return (
    <footer className="sur-encre bg-encre text-craie-sur-encre print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-[15px] sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <Logo negatif titre="DÉTOUR" className="h-10 w-auto" />
          <p className="mt-4 font-titre text-xl font-semibold tracking-[-0.025em] text-craie">Prenez le pas de côté.</p>
        </div>
        <div>
          <p className="font-semibold text-craie">Agence de Nantes</p>
          <p className="mt-1">12 rue des Écluses, 44000 Nantes</p>
          <p>Du mardi au samedi, 10 h – 19 h</p>
        </div>
        <div>
          <p className="font-semibold text-craie">Votre voyage</p>
          <p className="mt-1">
            <Link href="/suivi" className="text-craie! underline">Suivre ma demande</Link>
          </p>
          <p className="mt-1">
            <Link href="/compte" className="text-craie! underline">Mon espace</Link>
          </p>
          <p className="mt-5 font-semibold text-craie">Vous êtes conseiller ?</p>
          <p className="mt-1">
            <Link href="/conseiller" className="text-craie! underline">Ouvrir l’espace conseiller</Link>
          </p>
        </div>
      </div>
      <p className="border-t border-craie/15 px-4 py-3 text-center text-xs text-craie-sourde">
        Projet pédagogique Off the Map. Agence, prestataires et prix fictifs.
      </p>
    </footer>
  );
}
