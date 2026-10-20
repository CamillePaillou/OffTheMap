import type { Metadata } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Suspense } from "react";
import { EnTete, EnTeteSelon } from "./_composants/en-tete";
import { PiedDePage, PiedDePageReduit } from "./_composants/pied-de-page";
import "./globals.css";

// Titres : Bricolage Grotesque, un peu décalée comme les week-ends DÉTOUR. Texte : Atkinson Hyperlegible, faite pour être lue.
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const atkinson = Atkinson_Hyperlegible({ variable: "--font-atkinson", subsets: ["latin"], weight: ["400", "700"] });
// Espace conseiller : Instrument Sans, une seule famille pour un outil calme.
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DÉTOUR · Week-ends insolites en train", template: "%s · DÉTOUR" },
  description: "Week-ends insolites et sur mesure, en train : décrivez votre projet, un conseiller DÉTOUR le prépare avec vous.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${atkinson.variable} ${instrument.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2">
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
      </body>
    </html>
  );
}
