import { NextResponse, type NextRequest } from 'next/server';
import { ConversationChatbot, MESSAGES_FIXES, repondreChatbot } from '@/src/application/repondreChatbot';
import { creerModeleChat } from '@/src/infrastructure/llm';
import { creerPrestataires } from '@/src/infrastructure/prestataires/simulateur';
import type { Prestataires } from '@/src/ports/prestataires';

const TAILLE_MAX = 16_000; // octets : l'historique d'une conversation courte

/** Sans clé d'équipe, le chatbot répond « non vérifié » au lieu de planter. */
const SIMULATEUR_ABSENT: Pick<Prestataires, 'catalogue' | 'disponibilite'> = {
  catalogue: async () => ({ ok: false, panne: 'erreur_serveur' }),
  disponibilite: async () => ({ ok: false, panne: 'erreur_serveur' }),
};

/**
 * Chatbot du site (E1.3). Sans compte, sans cookie, sans rien stocker : le navigateur envoie la conversation, le
 * serveur répond. Clés OpenRouter et d'équipe lues ici, côté serveur ; jamais renvoyées au navigateur.
 */
export async function POST(requete: NextRequest) {
  const entetes = { 'Cache-Control': 'no-store' };
  if (Number(requete.headers.get('content-length') ?? 0) > TAILLE_MAX) {
    return NextResponse.json({ erreur: 'Message trop long.' }, { status: 413, headers: entetes });
  }
  let corps: unknown;
  try {
    corps = JSON.parse((await requete.text()).slice(0, TAILLE_MAX));
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400, headers: entetes });
  }
  const conversation = ConversationChatbot.safeParse(corps);
  if (!conversation.success) {
    return NextResponse.json({ erreur: 'Requête refusée : messages du visiteur, 600 caractères au plus.' }, { status: 400, headers: entetes });
  }

  let prestataires: Pick<Prestataires, 'catalogue' | 'disponibilite'>;
  try {
    prestataires = creerPrestataires();
  } catch {
    prestataires = SIMULATEUR_ABSENT;
  }
  try {
    const reponse = await repondreChatbot(conversation.data, { modele: creerModeleChat(), prestataires });
    return NextResponse.json(reponse, { headers: entetes });
  } catch {
    // configuration du modèle absente ou erreur imprévue : même réponse que si le modèle était injoignable
    return NextResponse.json({ texte: MESSAGES_FIXES.modeleIndisponible, verification: null, suggestion: null }, { headers: entetes });
  }
}
