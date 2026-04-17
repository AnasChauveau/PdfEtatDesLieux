// middleware.ts - refresh de session Supabase sur toutes les routes.
// Protège uniquement /dashboard et /account (routes futures).
// NE redirige PAS / vers /login - le formulaire est accessible sans auth.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes qui nécessitent une session active
const PROTECTED_PATHS = ['/dashboard', '/account'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Piège n°1 évité : assets statiques et routes auth passent sans vérif
  const { pathname } = req.nextUrl;
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico';

  if (isPublicPath) return res;

  // Créer le client SSR avec lecture/écriture des cookies sur req/res
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh la session (getUser valide côté serveur, pas getSession)
  const { data: { user } } = await supabase.auth.getUser();

  // Redirection uniquement pour les routes protégées
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
