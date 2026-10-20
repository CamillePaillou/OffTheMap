/**
 * Adaptateur du simulateur du formateur (E0.17, ADR-0011).
 * - La clé d'équipe (`X-Team-Key`) vient de la configuration serveur, jamais du navigateur.
 * - Les montants arrivent en euros entiers et sont convertis en centimes ICI, nulle part ailleurs.
 * - Toute réponse est validée par un schéma Zod ; sinon : panne `reponse_invalide`.
 * - Pannes que le simulateur ne produit pas, injectées à la demande : `delai` et `erreur_serveur`.
 */
import { z } from 'zod';
import type { ZodType } from 'zod';
import {
  CatalogueSimulateur, DisponibiliteSimulateur, ErreurSimulateur, OptionSimulateur, ReservationSimulateur,
} from '../../../types';
import type { ResultatSimulateur } from '../../../types';
import type {
  Disponibilite, LigneDemandee, OptionPosee, PrestationCatalogue, Prestataires, ReservationConfirmee,
} from '../../ports/prestataires';

export type PanneInjectee = 'aucune' | 'delai' | 'erreur_serveur';

export interface ConfigSimulateur {
  baseUrl: string;
  cleEquipe: string;
  /** Délai maximal d'une requête (ms). */
  delaiMs?: number;
  panne?: PanneInjectee;
  /** Pour les tests : remplace `fetch`. */
  fetchImpl?: typeof fetch;
}

/** Le simulateur enveloppe ses réponses d'écriture : {"option": …} et {"reservation": …}. */
const EnveloppeOption = z.object({ option: OptionSimulateur });
const EnveloppeReservation = z.object({ reservation: ReservationSimulateur });

const versCentimes = (eur: number) => eur * 100;

export class PrestatairesSimulateur implements Prestataires {
  private readonly delaiMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ConfigSimulateur) {
    this.delaiMs = config.delaiMs ?? 5000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /** Lit une panne injectée ; modifiable en cours de route (tests, campagne E11.2). */
  set panne(p: PanneInjectee) { this.config.panne = p; }

  async catalogue() {
    return this.appeler('GET', '/api/v1/catalogue', CatalogueSimulateur, (c): PrestationCatalogue[] =>
      c.prestations.map((p) => ({
        id: p.id, type: p.type, nom: p.nom, destination: p.destination,
        prix_unitaire_cents: versCentimes(p.prix_unitaire_eur), capacite: p.capacite,
        ...(p.description !== undefined ? { description: p.description } : {}), tags: p.tags,
      })));
  }

  async disponibilite(l: LigneDemandee) {
    const q = new URLSearchParams({ prestation_id: l.prestation_id, date: l.date, participants: String(l.participants) });
    return this.appeler('GET', `/api/v1/disponibilites?${q}`, DisponibiliteSimulateur, (d): Disponibilite => ({
      prestation_id: d.prestation_id, date: d.date, participants: d.participants,
      disponible: d.disponible, places_restantes: d.places_restantes,
      prix_unitaire_cents: versCentimes(d.prix_unitaire_eur), prix_total_cents: versCentimes(d.prix_total_eur),
    }));
  }

  async poserOption(l: LigneDemandee) {
    return this.appeler('POST', '/api/v1/options', EnveloppeOption, ({ option: o }): OptionPosee => ({
      option_id: o.id, prestation_id: o.prestation_id, date: o.date, participants: o.participants,
      prix_total_cents: versCentimes(o.prix_total_eur), statut: o.statut, expire_le: o.expire_le,
    }), { corps: l });
  }

  async confirmerReservation(a: { option_id: string; cle_approbation: string; approuve_par: string }) {
    return this.appeler('POST', '/api/v1/reservations', EnveloppeReservation, ({ reservation }) => versReservation(reservation), {
      corps: { option_id: a.option_id, approuve_par: a.approuve_par },
      entetes: { 'X-Approval-Key': a.cle_approbation },
    });
  }

  async annulerReservation(a: { reservation_id: string; cle_approbation: string; approuve_par: string }) {
    return this.appeler('POST', `/api/v1/reservations/${encodeURIComponent(a.reservation_id)}/annuler`, EnveloppeReservation, ({ reservation }) => versReservation(reservation), {
      // Le simulateur ne lit pas de corps pour l'annulation : seule la clé d'approbation compte.
      entetes: { 'X-Approval-Key': a.cle_approbation },
    });
  }

  private async appeler<B, T>(
    methode: 'GET' | 'POST', chemin: string, schema: ZodType<B>, convertir: (b: B) => T,
    opts: { corps?: unknown; entetes?: Record<string, string> } = {},
  ): Promise<ResultatSimulateur<T>> {
    // Pannes injectées : aucune requête n'est envoyée.
    if (this.config.panne === 'delai') return { ok: false, panne: 'delai' };
    if (this.config.panne === 'erreur_serveur') return { ok: false, panne: 'erreur_serveur' };

    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), this.delaiMs);
    try {
      const rep = await this.fetchImpl(new URL(chemin, this.config.baseUrl), {
        method: methode,
        signal: controle.signal,
        headers: {
          'X-Team-Key': this.config.cleEquipe,
          Accept: 'application/json',
          ...(opts.corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...opts.entetes,
        },
        ...(opts.corps !== undefined ? { body: JSON.stringify(opts.corps) } : {}),
      });
      const json: unknown = await rep.json().catch(() => undefined);

      if (!rep.ok) {
        if (rep.status >= 500) return { ok: false, panne: 'erreur_serveur' };
        const e = ErreurSimulateur.safeParse(json);
        if (!e.success) return { ok: false, panne: 'reponse_invalide' };
        return { ok: false, panne: 'refus', code: e.data.erreur.code, message: e.data.erreur.message, http: rep.status };
      }
      const r = schema.safeParse(json);
      return r.success ? { ok: true, valeur: convertir(r.data) } : { ok: false, panne: 'reponse_invalide' };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return { ok: false, panne: 'delai' };
      return { ok: false, panne: 'erreur_serveur' };
    } finally {
      clearTimeout(minuteur);
    }
  }
}

function versReservation(r: z.infer<typeof ReservationSimulateur>): ReservationConfirmee {
  return {
    reservation_id: r.id, option_id: r.option_id, prestation_id: r.prestation_id, date: r.date,
    participants: r.participants, prix_total_cents: versCentimes(r.prix_total_eur), statut: r.statut,
    approuve_par: r.approuve_par, confirmee_le: r.confirmee_le,
  };
}

/** Construit l'adaptateur depuis l'environnement serveur. Échoue clairement si la clé d'équipe manque. */
export function creerPrestataires(env: Record<string, string | undefined> = process.env): PrestatairesSimulateur {
  const cleEquipe = env.SIMULATEUR_TEAM_KEY?.trim();
  if (!cleEquipe) throw new Error('SIMULATEUR_TEAM_KEY manquante dans .env (clé d’équipe du simulateur)');
  const panne = (env.SIMULATEUR_PANNE?.trim() || 'aucune') as PanneInjectee;
  if (!['aucune', 'delai', 'erreur_serveur'].includes(panne)) throw new Error(`SIMULATEUR_PANNE invalide : ${panne}`);
  return new PrestatairesSimulateur({
    baseUrl: env.SIMULATEUR_URL?.trim() || 'http://simulateur:8765',
    cleEquipe,
    delaiMs: Number(env.SIMULATEUR_DELAI_MS) || 5000,
    panne,
  });
}
