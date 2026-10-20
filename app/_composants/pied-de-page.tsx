'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Pied de page : complet sur le site public, réduit à une ligne dans l'espace conseiller (un outil de travail). */
export function PiedDePage() {
  const chemin = usePathname();
  return chemin.startsWith('/conseiller') || chemin.startsWith('/connexion') ? <PiedDePageReduit /> : <PiedDePagePublic />;
}

/** Une ligne : sert aussi de repli au prérendu, avant que le chemin soit connu. */
export function PiedDePageReduit() {
  return (
    <footer className="border-t border-trait bg-white px-4 py-3 text-center text-xs text-ardoise print:hidden">
      DÉTOUR · Projet pédagogique Off the Map. Agence, prestataires et prix fictifs.
    </footer>
  );
}

function PiedDePagePublic() {
  return (
    <footer className="bg-nuit text-[#d8e6f0] print:hidden">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-titre text-lg font-semibold text-white">DÉTOUR</p>
          <p className="mt-1">Week-ends insolites en train, préparés par un conseiller.</p>
        </div>
        <div>
          <p className="font-semibold text-white">Nos destinations</p>
          <p className="mt-1">Nantes, Lyon et Lille, au départ de Paris.</p>
        </div>
        <div>
          <p className="font-semibold text-white">Vous êtes conseiller ?</p>
          <p className="mt-1">
            <Link href="/conseiller" className="text-white! underline underline-offset-4">Ouvrir l’espace conseiller</Link>
          </p>
        </div>
      </div>
      <p className="border-t border-white/15 px-4 py-3 text-center text-xs text-[#b9cddc]">
        Projet pédagogique Off the Map. Agence, prestataires et prix fictifs.
      </p>
    </footer>
  );
}
