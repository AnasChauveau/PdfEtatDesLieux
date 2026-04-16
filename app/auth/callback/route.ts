// Route Handler : échange le code PKCE → session Supabase, puis redirige vers l'app.
// Supabase Magic Link redirige ici après clic dans le mail.

import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const restoreDraft = searchParams.get('restoreDraft');

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(`${origin}/login?error=callback_failed`);
    }
  }

  // Redirige vers / avec le flag restoreDraft si le draft est en attente
  const redirectTo = restoreDraft === 'true' ? `${origin}/?restoreDraft=true` : `${origin}/`;
  return NextResponse.redirect(redirectTo);
}
