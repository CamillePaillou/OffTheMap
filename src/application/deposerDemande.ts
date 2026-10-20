/**
 * Déposer une demande (E1.1). Valide la saisie ; si elle est invalide, rien n'est écrit et chaque erreur est
 * rattachée à son champ. Sinon, le dossier est créé au statut nouvelle avec la version 1 de la demande.
 * La génération de la fiche (E2.2) est lancée ensuite par l'action serveur (genererEnArrierePlan), après la réponse.
 */
import { schemaSaisieDemande, versNouvelleDemande, type NouvelleDemande } from '../../types/demande';
import type { DemandeDeposee, DemandesRepository } from '../ports/demandes';

export type ErreursChamps = Partial<Record<string, string>>;

export type ResultatDepot = { ok: true; depot: DemandeDeposee } | { ok: false; erreurs: ErreursChamps };

/** Valide la saisie du formulaire ; chaque erreur est rattachée à son champ. Partagé avec la correction (E1.2). */
export function validerSaisie(saisie: unknown, aujourdhui: string): { ok: true; demande: NouvelleDemande } | { ok: false; erreurs: ErreursChamps } {
  const verdict = schemaSaisieDemande(aujourdhui).safeParse(saisie);
  if (verdict.success) return { ok: true, demande: versNouvelleDemande(verdict.data) };
  const erreurs: ErreursChamps = {};
  for (const issue of verdict.error.issues) {
    const champ = String(issue.path[0] ?? 'formulaire');
    erreurs[champ] ??= issue.message;
  }
  return { ok: false, erreurs };
}

export async function deposerDemande(repo: DemandesRepository, saisie: unknown, aujourdhui: string): Promise<ResultatDepot> {
  const v = validerSaisie(saisie, aujourdhui);
  if (!v.ok) return v;
  const depot = await repo.deposer(v.demande);
  return { ok: true, depot };
}
