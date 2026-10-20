/**
 * Essai réel de l'agent (E8.3) : OpenRouter + simulateur du formateur. Ignoré par `npm test` et la CI.
 * Lancement : `make essai-agent` (simulateur démarré, LLM_API_KEY et LLM_MODEL dans .env).
 * Chaque modèle configuré, principal puis réserve, est essayé seul sur une vraie prestation du catalogue.
 * `make essai-agent PANNE=delai` (ou `erreur_serveur`) : le simulateur est en panne pour l'agent,
 * la vérification doit finir « non vérifié », sans prix ni places.
 */
import { describe, expect, it } from 'vitest';
import { contientSecret } from '../domain/verification/expurger';
import { lireConfigOpenRouter, OpenRouterLlmClient } from '../infrastructure/llm/openrouter-llm-client';
import { creerPrestataires } from '../infrastructure/prestataires/simulateur';
import { verifierPrestation } from './verifierPrestation';

const actif = process.env.LLM_ESSAI_REEL === '1';
const config = actif ? lireConfigOpenRouter(process.env) : null;
const panne = process.env.SIMULATEUR_PANNE?.trim() || 'aucune';

/** Un samedi dans trois semaines, au format AAAA-MM-JJ. */
function samediProchain(): string {
  const d = new Date(Date.now() + 21 * 86_400_000);
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!actif)('agent de vérification, appel réel', () => {
  for (const modele of config?.modeles ?? []) {
    it(`${modele} vérifie une prestation du simulateur (panne : ${panne})`, async () => {
      // Le catalogue est lu sans panne ; seul l'agent subit la panne simulée.
      const catalogue = await creerPrestataires({ ...process.env, SIMULATEUR_PANNE: 'aucune' }).catalogue();
      const prestataires = creerPrestataires(process.env);
      if (!catalogue.ok) throw new Error(`simulateur injoignable (${catalogue.panne}) : lancer « docker compose up -d simulateur »`);
      const p = catalogue.valeur.find((x) => x.type === 'activite') ?? catalogue.valeur[0]!;

      const r = await verifierPrestation(
        { prestation_id: p.id, nom: p.nom, date: samediProchain(), participants: 2 },
        {
          modele: new OpenRouterLlmClient({ ...config!, modeles: [modele] }),
          prestataires,
          secrets: [process.env.LLM_API_KEY, process.env.SIMULATEUR_TEAM_KEY],
        },
      );
      console.info(JSON.stringify({ modele, panne, prestation: p.id, statut: r.statut, arret: r.arret, nb_tours: r.nb_tours, prix_unitaire_cents: r.prix_unitaire_cents, places_restantes: r.places_restantes, decisions: r.trace.map((t) => t.decision.raison ?? t.decision.statut) }));

      if (panne === 'aucune') {
        expect(r.arret).toBe('conclusion');
        expect(['ok', 'indisponible']).toContain(r.statut);
        expect(r.prix_unitaire_cents).toBe(r.reponse_serveur!.prix_unitaire_cents);
      } else {
        expect(r).toMatchObject({ statut: 'echec', arret: 'echec_serveur', prix_unitaire_cents: null, places_restantes: null });
      }
      expect(contientSecret(r.trace, [process.env.LLM_API_KEY, process.env.SIMULATEUR_TEAM_KEY])).toBe(false);
    }, 120_000);
  }
});
