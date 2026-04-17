// lib/supabase-server.ts - client serveur avec gestion des cookies de session
// À utiliser uniquement dans Server Components, Route Handlers et middleware.
// NE PAS importer dans des Client Components ('use client') - risque "window is not defined".

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

// Helper pratique pour récupérer le user courant côté serveur.
// Utilise getUser() (validation serveur) et non getSession() (local uniquement).
export async function getUser() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
