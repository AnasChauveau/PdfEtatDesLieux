'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';

type Status = 'idle' | 'sending' | 'sent';

const ERROR_MESSAGES: Record<string, string> = {
  'Invalid email': 'Adresse email invalide.',
  'Email rate limit exceeded': 'Trop de tentatives. Attendez quelques minutes avant de réessayer.',
  'Unable to validate email address: invalid format': 'Format d\'email invalide.',
  'Signups not allowed for otp': 'Les inscriptions sont actuellement désactivées.',
  'For security purposes, you can only request this after': 'Trop de tentatives. Attendez quelques secondes.',
};

function translateError(message: string): string {
  for (const [key, translation] of Object.entries(ERROR_MESSAGES)) {
    if (message.includes(key)) return translation;
  }
  return 'Une erreur est survenue. Vérifiez votre email et réessayez.';
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ restoreDraft?: string }>;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Note: searchParams est async en Next.js 15+, on le lit via un state/effect ou on passe par useSearchParams côté client
  const [isRestoring] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('restoreDraft') === 'true';
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'sending') return;

    setStatus('sending');
    setError(null);

    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback${isRestoring ? '?restoreDraft=true' : ''}`;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (otpError) {
      setError(translateError(otpError.message));
      setStatus('idle');
      return;
    }

    setStatus('sent');
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo / titre */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Express EDL</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isRestoring
              ? 'Votre formulaire vous attend - connectez-vous pour finaliser'
              : 'Connectez-vous pour accéder à vos états des lieux'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          {status === 'sent' ? (
            /* État "envoyé" */
            <div className="text-center py-2">
              <div className="flex justify-center mb-4">
                <CheckCircle2 size={40} className="text-green-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900 mb-2">Vérifiez votre boîte mail</h2>
              <p className="text-sm text-slate-500">
                Un lien de connexion a été envoyé à{' '}
                <span className="font-semibold text-slate-700">{email}</span>.
                Cliquez dessus pour vous connecter.
              </p>
              <p className="text-xs text-slate-400 mt-3">
                Pas reçu ? Vérifiez vos spams ou{' '}
                <button
                  type="button"
                  onClick={() => { setStatus('idle'); setError(null); }}
                  className="text-blue-500 hover:underline"
                >
                  réessayez
                </button>
                .
              </p>
            </div>
          ) : (
            /* Formulaire */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Adresse email
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="votre@email.fr"
                    autoComplete="email"
                    autoFocus
                    required
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
                  />
                </div>
                {error && (
                  <p className="mt-1.5 text-xs text-red-600">{error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!email.trim() || status === 'sending'}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {status === 'sending' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    Recevoir mon lien de connexion
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                Pas de mot de passe - un lien magique par email.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
