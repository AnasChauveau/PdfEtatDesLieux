// Route Handler POST : déconnexion Supabase + redirect vers /login.
// Utilisé via un <form method="POST" action="/auth/signout"> dans le Header.

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
