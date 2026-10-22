/**
 * Ce que le modèle reçoit pour résumer les écarts entre deux versions (E6.3) : les écarts calculés par le code (E6.2),
 * traduits en faits qualitatifs, SANS AUCUN CHIFFRE. Ni montant, ni date, ni nombre : le modèle ne peut pas recopier
 * un prix qu'il n'a pas reçu, et son texte est en plus refusé s'il contient un chiffre ou un montant (EcartsIA).
 */
import type { TypePrestation } from '../../../types/enums';
import type { EcartsVersions } from './ecartsVersions';

export type Sens = 'hausse' | 'baisse' | 'identique';

export interface PrestationEcartee {
  nom: string;
  type: TypePrestation;
  nature: 'ajoutee' | 'retiree' | 'modifiee';
  /** Pour une prestation modifiée : ce qui a bougé. Vide sinon. */
  jours: 'plus' | 'moins' | 'deplaces' | null; // nuits pour un hébergement
  participants: 'plus' | 'moins' | null;
  prix: Sens; // coût de la prestation dans la version suivante par rapport à la précédente
}

export interface EntreeEcarts {
  prestations: PrestationEcartee[];
  prestations_inchangees: boolean;
  total: Sens;
  /** La nouvelle version a encore des prix catalogue : le résumé doit rester prudent sur le coût. */
  prix_a_confirmer: boolean;
}

const sens = (delta: number): Sens => (delta > 0 ? 'hausse' : delta < 0 ? 'baisse' : 'identique');

export function versEntreeEcarts(e: EcartsVersions): EntreeEcarts {
  return {
    prestations: e.prestations.map((p) => {
      const avant = p.avant;
      const apres = p.apres;
      let jours: PrestationEcartee['jours'] = null;
      let participants: PrestationEcartee['participants'] = null;
      if (p.nature === 'modifiee' && avant && apres) {
        if (p.changements.includes('dates')) {
          jours = apres.dates.length > avant.dates.length ? 'plus' : apres.dates.length < avant.dates.length ? 'moins' : 'deplaces';
        }
        if (p.changements.includes('participants')) {
          participants = Math.max(...apres.participants) >= Math.max(...avant.participants) ? 'plus' : 'moins';
        }
      }
      return { nom: p.nom, type: p.type, nature: p.nature, jours, participants, prix: sens(p.delta_cents) };
    }),
    prestations_inchangees: e.inchangees > 0,
    total: sens(e.delta_total_cents),
    prix_a_confirmer: e.prix_a_verifier,
  };
}
