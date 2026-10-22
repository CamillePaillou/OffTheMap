import type { StatutDossier, StatutProposition } from '@/types/enums';
import { ETAPES_CLIENT, suiviClient } from '@/src/domain/suiviClient';
import { Ligne } from './ligne';

const ARRETS = { a_completer: 'À compléter', non_retenue: 'Demande non retenue', clos: 'Dossier clos' } as const;

/** « le 15 octobre à 11 h 00 », heure de Paris. */
export function quand(iso: string) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ');
  return `le ${jour} à ${heure}`;
}

/**
 * Où en est le voyage, comme un suivi de colis : la ligne des six étapes, puis une phrase sur ce qui se passe
 * maintenant. Même affichage pour le suivi par numéro et pour l'espace client.
 */
export function SuiviVoyage({
  dossier,
  proposition,
  misAJourLe,
  compacte = false,
  reponseTransmise = false,
}: {
  dossier: StatutDossier;
  proposition: StatutProposition | null;
  misAJourLe?: string;
  compacte?: boolean;
  /** Le client a répondu en ligne ; le conseiller ne l'a pas encore enregistré. */
  reponseTransmise?: boolean;
}) {
  const s = suiviClient(dossier, proposition);
  const message = reponseTransmise && s.etape === 3 ? 'Votre réponse est transmise au conseiller : il revient vers vous.' : s.message;
  return (
    <div className="flex flex-col gap-4">
      <Ligne titre="Où en est votre voyage" stations={ETAPES_CLIENT} actuelle={s.etape} compacte={compacte} />
      <div className={`rounded-lg border-l-4 px-3 py-2 ${s.arret === 'non_retenue' || s.arret === 'clos' ? 'border-ballast bg-craie' : 'border-encre bg-ciel-pale'} text-encre`}>
        {s.arret && <p className="font-semibold">{ARRETS[s.arret]}</p>}
        <p>{message}</p>
        {misAJourLe && <p className="mt-1 text-sm text-encre-doux">Dernière mise à jour {quand(misAJourLe)}.</p>}
      </div>
    </div>
  );
}
