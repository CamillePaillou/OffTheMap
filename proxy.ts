import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { estProtege, estProtegeClient, urlConnexion, urlConnexionClient } from '@/lib/auth/redirection';

// Protection de /conseiller (E0.11) et de l'espace client /compte : rafraîchit la session Supabase et renvoie vers la
// page de connexion sans session. Contrôle rapide seulement ; le contrôle sûr est fait par exigerConseiller() et
// exigerClient(), et la propriété d'un dossier par les fonctions SQL de l'espace client.
export async function proxy(request: NextRequest) {
  let reponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (aEcrire) => {
          for (const { name, value } of aEcrire) request.cookies.set(name, value);
          reponse = NextResponse.next({ request });
          for (const { name, value, options } of aEcrire) reponse.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (!data?.claims && estProtege(pathname)) {
    return NextResponse.redirect(new URL(urlConnexion(pathname + search), request.url));
  }
  if (!data?.claims && estProtegeClient(pathname)) {
    return NextResponse.redirect(new URL(urlConnexionClient(pathname + search), request.url));
  }
  return reponse;
}

export const config = {
  matcher: ['/conseiller/:path*', '/compte/:path*'],
};
