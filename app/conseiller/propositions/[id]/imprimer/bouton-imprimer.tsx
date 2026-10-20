'use client';

/** Ouvre l'impression du navigateur : « Enregistrer au format PDF » donne la pièce jointe du mail (E5.4). */
export function BoutonImprimer() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded bg-zinc-900 px-4 py-2 text-sm text-white print:hidden">
      Imprimer ou enregistrer en PDF
    </button>
  );
}
