import type { ReactNode } from 'react';

/**
 * Le saut typographique de la charte : dans un titre ou une accroche de 28 px et plus, un seul o (celui du mot qui
 * porte l'idée) monte d'une demi-hauteur et passe en jaune. Un par écran ; jamais dans un texte courant, un prix ou
 * une adresse. Les lecteurs d'écran lisent le mot entier, sans coupure.
 *
 *   <h1>Le meilleur du voyage, c’est le <Saut avant="dét" apres="ur" />.</h1>
 */
export function Saut({ avant, apres, o = 'o' }: { avant: string; apres: string; o?: 'o' | 'O' }): ReactNode {
  return (
    <span className="whitespace-nowrap">
      {avant}
      <span className="saut">{o}</span>
      {apres}
    </span>
  );
}
