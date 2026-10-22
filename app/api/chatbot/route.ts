import { NextResponse, type NextRequest } from 'next/server';
import { ConversationChatbot, MESSAGES_FIXES, repondreChatbot } from '@/src/application/repondreChatbot';
import { creerModeleChat } from '@/src/infrastructure/llm';
import { lireCatalogueAgence } from '@/src/infrastructure/db/catalogueSupabase';
import { catalogueAvecSecours } from '@/src/infrastructure/prestataires/catalogueChatbot';
import { creerPrestataires } from '@/src/infrastructure/prestataires/simulateur';
import type { Prestataires } from '@/src/ports/prestataires';

const TAILLE_MAX = 16_000; // octets : l'historique d'une conversation courte

/** Sans clé d'équipe : les disponibilités répondent « non vérifié » au lieu de planter. */
const DISPONIBILITE_ABSENTE: Prestataires['disponibilite'] = async () => ({ ok: false, panne: 'erreur_serveur' });

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

  let simulateur: Prestataires | null = null;
  try {
    simulateur = creerPrestataires();
  } catch {
    simulateur = null; // clé d'équipe absente : catalogue de l'agence, disponibilités non vérifiées
  }
  // le catalogue du simulateur, à défaut celui que l'agence en a importé : le chatbot répond toujours sur l'offre
  const prestataires = {
    catalogue: catalogueAvecSecours(simulateur ? () => simulateur.catalogue() : null, lireCatalogueAgence),
    disponibilite: simulateur ? (l: Parameters<Prestataires['disponibilite']>[0]) => simulateur.disponibilite(l) : DISPONIBILITE_ABSENTE,
  };
  try {
    const reponse = await repondreChatbot(conversation.data, { modele: creerModeleChat(), prestataires });
    return NextResponse.json(reponse, { headers: entetes });
  } catch {
    // configuration du modèle absente ou erreur imprévue : même réponse que si le modèle était injoignable
    return NextResponse.json({ texte: MESSAGES_FIXES.modeleIndisponible, verification: null, suggestion: null }, { headers: entetes });
  }
}
