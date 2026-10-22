import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Suspense } from "react";
import { ChatbotSite } from "./_composants/chatbot";
import { EnTete, EnTeteSelon } from "./_composants/en-tete";
import { PiedDePage, PiedDePageReduit } from "./_composants/pied-de-page";
import "./globals.css";

// Charte DÉTOUR 2026 : deux familles, pas de troisième. Bricolage Grotesque 600 et 800 pour les titres, prix et
// accroches ; Instrument Sans 400, 500 et 600 pour les textes et les interfaces (site et espace conseiller).
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["600", "800"] });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "DÉTOUR · Prenez le pas de côté", template: "%s · DÉTOUR" },
  description: "Des week-ends insolites en train, composés sur mesure par un conseiller qui vérifie chaque prix, chaque place et chaque horaire.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${instrument.variable} h-full antialiased`}>
      {/* des extensions du navigateur (ColorZilla, Grammarly…) ajoutent des attributs à body avant React : sans effet */}
      <body className="flex min-h-full flex-col font-sans" suppressHydrationWarning>
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-carte focus:px-3 focus:py-2">
          Aller au contenu
        </a>
        {/* le chemin n'est connu qu'à la requête : l'en-tête public sert de repli au prérendu */}
        <Suspense fallback={<EnTeteSelon chemin="" />}>
          <EnTete />
        </Suspense>
        <div id="contenu" className="flex flex-1 flex-col">
          {children}
        </div>
        <Suspense fallback={<PiedDePageReduit />}>
          <PiedDePage />
        </Suspense>
        {/* chatbot du site public (E1.3) : le chemin décide où il apparaît */}
        <Suspense fallback={null}>
          <ChatbotSite />
        </Suspense>
      </body>
    </html>
  );
}
