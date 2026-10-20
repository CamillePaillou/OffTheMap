/**
 * Contrôles du programme sur un appel d'outil proposé par le modèle (E8.3, contrat de l'agent,
 * rubrique « Contrôles du programme »), AVANT toute requête au simulateur :
 * 1. le nom de l'outil est dans `OUTILS_AUTORISES` ;
 * 2. les arguments passent `ArgsVerifierDisponibilite` ;
 * 3. ils sont identiques à ceux de la ligne : l'agent ne vérifie pas autre chose que ce qui lui est demandé ;
 * 4. un seul appel d'outil par tour.
 * Tout refus est tracé et compte comme un tour (c'est la boucle qui s'en charge).
 *
 * Règle pure, sans dépendance.
 */
import { ArgsVerifierDisponibilite, OUTILS_AUTORISES } from '../../../types';

/** Ce que le modèle a proposé, tel qu'il sera écrit dans la trace (`AppelTrace`). */
export interface AppelPropose {
  nom: string;
  /** Arguments décodés ; `{ brut }` s'ils ne sont pas un objet JSON lisible. */
  arguments: Record<string, unknown>;
}

export type VerdictAppel =
  | { statut: 'accepte'; appel: AppelPropose; args: ArgsVerifierDisponibilite }
  | { statut: 'refuse'; appel: AppelPropose; raison: string };

/** Appel brut au format « tool_calls » : nom et arguments en texte JSON. */
export interface AppelBrut {
  function: { name: string; arguments: string };
}

export function validerAppel(appels: readonly AppelBrut[], ligne: ArgsVerifierDisponibilite): VerdictAppel {
  const appel = decoder(appels[0]!);

  if (appels.length > 1) {
    return { statut: 'refuse', appel, raison: `un seul appel d’outil par tour (${appels.length} proposés)` };
  }
  if (!(OUTILS_AUTORISES as readonly string[]).includes(appel.nom)) {
    return { statut: 'refuse', appel, raison: `outil non autorisé : ${appel.nom}` };
  }
  const r = ArgsVerifierDisponibilite.safeParse(appel.arguments);
  if (!r.success) {
    return { statut: 'refuse', appel, raison: `arguments non conformes : ${r.error.issues.map((i) => i.path.join('.') || 'arguments').join(', ')}` };
  }
  const differents = (['prestation_id', 'date', 'participants'] as const).filter((c) => r.data[c] !== ligne[c]);
  if (differents.length > 0) {
    return { statut: 'refuse', appel, raison: `arguments différents de la ligne : ${differents.join(', ')}` };
  }
  return { statut: 'accepte', appel, args: r.data };
}

function decoder(brut: AppelBrut): AppelPropose {
  const nom = brut.function.name.slice(0, 100);
  try {
    const args: unknown = JSON.parse(brut.function.arguments);
    if (args !== null && typeof args === 'object' && !Array.isArray(args)) return { nom, arguments: args as Record<string, unknown> };
  } catch {
    // arguments illisibles : gardés en texte pour la trace
  }
  return { nom, arguments: { brut: brut.function.arguments.slice(0, 500) } };
}
