/**
 * Mail « à corriger » ouvert dans la messagerie du conseiller (mailto), relu avant envoi. Texte fixe, sans IA.
 * Les modèles des autres mails (rendez-vous, proposition, confirmation) relèvent d'E5.4.
 */
export function messageCorrection(m: { nom: string; motif: string; url: string; expireLe: string; conseiller: string }) {
  const jusquau = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(new Date(m.expireLe));
  return {
    sujet: 'Votre demande de voyage Detour : quelques précisions',
    corps: [
      `Bonjour ${m.nom},`,
      '',
      'Merci pour votre demande de voyage. Avant de vous proposer un programme, nous avons besoin de quelques précisions :',
      '',
      m.motif,
      '',
      `Vous pouvez compléter votre demande ici, les points à revoir y sont signalés (lien valable une fois, jusqu’au ${jusquau}) :`,
      m.url,
      '',
      'Bien cordialement,',
      m.conseiller,
      'Detour',
    ].join('\n'),
  };
}
