/**
 * Déposer une demande (E1.1). Valide la saisie ; si elle est invalide, rien n'est écrit et chaque erreur est
 * rattachée à son champ. Sinon, le dossier est créé au statut nouvelle avec la version 1 de la demande.
 * La génération de la fiche (E2.2) sera lancée ici, après le dépôt.
 */
import { schemaSaisieDemande, versNouvelleDemande } from '../../types/demande';
import type { DemandeDeposee, DemandesRepository } from '../ports/demandes';

export type ErreursChamps = Partial<Record<string, string>>;

export type ResultatDepot = { ok: true; depot: DemandeDeposee } | { ok: false; erreurs: ErreursChamps };

export async function deposerDemande(repo: DemandesRepository, saisie: unknown, aujourdhui: string): Promise<ResultatDepot> {
  const verdict = schemaSaisieDemande(aujourdhui).safeParse(saisie);
  if (!verdict.success) {
    const erreurs: ErreursChamps = {};
    for (const issue of verdict.error.issues) {
      const champ = String(issue.path[0] ?? 'formulaire');
      erreurs[champ] ??= issue.message;
    }
    return { ok: false, erreurs };
  }
  const depot = await repo.deposer(versNouvelleDemande(verdict.data));
  return { ok: true, depot };
}
