/**
 * « La ligne » : un plan de ligne de train qui montre l'avancement. Stations passées en bleu, station actuelle
 * cerclée d'orange, stations à venir en gris. Horizontale sur grand écran, verticale sur téléphone.
 */
export interface Station {
  libelle: string;
  detail?: string;
}

export function Ligne({
  stations,
  actuelle,
  titre,
  compacte = false,
  verticale = false,
}: {
  stations: readonly Station[];
  actuelle: number;
  titre: string;
  compacte?: boolean;
  /** Toujours verticale, même sur grand écran (colonne étroite). */
  verticale?: boolean;
}) {
  const h = (classes: string) => (verticale ? '' : classes); // classes de la version horizontale
  return (
    <ol aria-label={titre} className={`flex flex-col gap-0 ${h('sm:flex-row')} ${compacte ? 'text-sm' : ''}`}>
      {stations.map((s, i) => {
        const etat = i < actuelle ? 'passee' : i === actuelle ? 'actuelle' : 'avenir';
        return (
          <li key={s.libelle} aria-current={etat === 'actuelle' ? 'step' : undefined} className={`relative flex flex-1 gap-3 ${compacte ? 'pb-3' : 'pb-5'} ${h('sm:flex-col sm:gap-2 sm:pb-0 sm:pr-3')}`}>
            {/* trait jusqu'à la station suivante */}
            {i < stations.length - 1 && (
              <span aria-hidden className={`absolute left-[0.5rem] top-5 h-full w-[3px] ${h('sm:left-5 sm:top-[0.5rem] sm:h-[3px] sm:w-full')} ${i < actuelle ? 'bg-bleu' : 'bg-filet'}`} />
            )}
            <span
              aria-hidden
              className={`relative z-[1] mt-0.5 block size-[1.2rem] shrink-0 rounded-full border-[3px] ${
                etat === 'passee' ? 'border-bleu bg-bleu' : etat === 'actuelle' ? 'border-orange bg-white ring-4 ring-orange/25' : 'border-filet bg-white'
              }`}
            />
            <span className="flex flex-col">
              <span className={`leading-snug ${etat === 'actuelle' ? 'font-bold text-nuit' : etat === 'passee' ? 'text-texte' : 'text-doux'}`}>
                {s.libelle}
                <span className="sr-only">{etat === 'passee' ? ' (fait)' : etat === 'actuelle' ? ' (étape actuelle)' : ' (à venir)'}</span>
              </span>
              {s.detail && !compacte && <span className="mt-0.5 text-sm text-doux">{s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
