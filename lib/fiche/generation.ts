import 'server-only';
import { after } from 'next/server';
import { genererFiche, lancerGenerationFiche, type ResultatGeneration } from '@/src/application/genererFiche';
import { GenerationFicheSupabase } from '@/src/infrastructure/db/generationFicheSupabase';
import { StatutsSupabase } from '@/src/infrastructure/db/statutsSupabase';
import { creerLlmClient, nomModele } from '@/src/infrastructure/llm';

/**
 * Lance la génération de la fiche côté serveur, après la réponse envoyée au navigateur (ADR-0005, sans webhook) :
 * le client n'attend pas le modèle. Le statut du dossier (fiche_en_cours, fiche_prete, erreur) dit où on en est.
 */
export function genererEnArrierePlan(dossierId: string, etape: 'apres_depot' | 'deja_en_cours') {
  after(async () => {
    let resultat: ResultatGeneration;
    try {
      const d = { statuts: new StatutsSupabase(), fiches: new GenerationFicheSupabase(), llm: creerLlmClient(), modele: nomModele() };
      resultat = etape === 'apres_depot' ? await lancerGenerationFiche(d, dossierId) : await genererFiche(d, dossierId);
    } catch (e) {
      // ni données du client ni clé dans les journaux du serveur : le nom de l'erreur seulement
      console.error(`[fiche] dossier ${dossierId} : génération interrompue (${e instanceof Error ? e.name : 'erreur'})`);
      return;
    }
    if (!resultat.ok) console.warn(`[fiche] dossier ${dossierId} : ${'raison' in resultat ? resultat.raison : `erreur après ${resultat.essais} essais`}`);
  });
}
