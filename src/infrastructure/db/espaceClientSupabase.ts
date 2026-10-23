import 'server-only';
import { clientSupabase } from '../../../lib/supabase/serveur';
import type { DemandeResumee, DetailDemande, EspaceClientRepository, ResultatReponseEnLigne, SuiviPublic } from '../../ports/espaceClient';

/**
 * Espace client, au nom du visiteur ou du client connecté (session lue dans les cookies, clé publique) : jamais la clé
 * service_role. Les fonctions SQL contrôlent elles-mêmes la propriété (adresse confirmée) ; un dossier d'un autre
 * client se lit comme un dossier inexistant.
 */
export class EspaceClientSupabase implements EspaceClientRepository {
  async suiviPublic(reference: string): Promise<SuiviPublic | null> {
    const { data, error } = await (await clientSupabase()).rpc('suivi_public', { p_reference: reference });
    if (error) throw new Error(`suivi_public : ${error.message}`);
    return (data as SuiviPublic | null) ?? null;
  }

  async mesDemandes(): Promise<DemandeResumee[]> {
    const { data, error } = await (await clientSupabase()).rpc('mes_demandes');
    if (error) throw new Error(`mes_demandes : ${error.message}`);
    return (data as DemandeResumee[] | null) ?? [];
  }

  async maDemande(dossierId: string): Promise<DetailDemande | null> {
    if (!/^[0-9a-f-]{36}$/i.test(dossierId)) return null;
    const { data, error } = await (await clientSupabase()).rpc('ma_demande', { p_dossier: dossierId });
    if (error) throw new Error(`ma_demande : ${error.message}`);
    return (data as DetailDemande | null) ?? null;
  }

  async repondre(propositionId: string, type: 'acceptee' | 'changement', message: string | null): Promise<ResultatReponseEnLigne> {
    const { error } = await (await clientSupabase()).rpc('repondre_proposition', { p_proposition: propositionId, p_type: type, p_message: message });
    if (!error) return { ok: true };
    if (error.code === 'OT020') return { ok: false, raison: 'introuvable' };
    if (error.code === 'OT021') return { ok: false, raison: 'plus_en_attente' };
    if (error.code === '23505') return { ok: false, raison: 'deja_repondu' };
    if (error.code === '23514') return { ok: false, raison: 'message_requis' };
    throw new Error(`repondre_proposition : ${error.message}`);
  }
}
