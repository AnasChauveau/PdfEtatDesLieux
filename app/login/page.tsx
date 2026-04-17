'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, ArrowRight } from 'lucide-react';

type Stage = 'email' | 'code' | 'verifying';

const OTP_ERRORS: Record<string, string> = {
  'Invalid email': 'Adresse email invalide.',
  'Email rate limit exceeded': 'Trop de tentatives. Attendez quelques minutes.',
  'Unable to validate email address: invalid format': "Format d'email invalide.",
  'Signups not allowed for otp': 'Les inscriptions sont actuellement désactivées.',
  'For security purposes, you can only request this after': 'Trop de tentatives. Attendez quelques secondes.',
};

function translateError(msg: string): string {
  for (const [key, translation] of Object.entries(OTP_ERRORS)) {
    if (msg.includes(key)) return translation;
  }
  return 'Une erreur est survenue. Vérifiez votre email et réessayez.';
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('email');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Décompte cooldown renvoi
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendCode = async (emailAddr: string) => {
    setStage('verifying');
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: emailAddr.trim() });
    if (otpError) {
      setError(translateError(otpError.message));
      setStage('email');
    } else {
      setStage('code');
      setResendCooldown(60);
    }
  };

  const verifyCode = async (code: string) => {
    setStage('verifying');
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email, token: code, type: 'email',
    });
    if (verifyError) {
      setError('Code invalide ou expiré. Réessayez.');
      setStage('code');
      setOtpCode('');
    } else {
      window.location.href = '/dashboard';
    }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Express EDL</h1>
          <p className="text-sm text-slate-500 mt-1">
            Connectez-vous pour accéder à vos états des lieux
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          {/* Stage : saisie email */}
          {stage === 'email' && (
            <form
              onSubmit={(e) => { e.preventDefault(); sendCode(email); }}
              className="space-y-4"
            >
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
                {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
              </div>
              <button
                type="submit"
                disabled={!email.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Recevoir mon code <ArrowRight size={15} />
              </button>
              <p className="text-center text-xs text-slate-400">
                Sans mot de passe — un code par email, valable 10 minutes.
              </p>
            </form>
          )}

          {/* Stage : chargement */}
          {stage === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-8 text-slate-500">
              <span className="w-7 h-7 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm">Vérification en cours…</p>
            </div>
          )}

          {/* Stage : saisie du code OTP */}
          {stage === 'code' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-3">
                  Code envoyé à <span className="font-semibold text-slate-700">{email}</span>. Valable 10 minutes.
                </p>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Code à 6 chiffres
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  autoFocus
                  onChange={async (e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpCode(val);
                    setError(null);
                    if (val.length === 6) await verifyCode(val);
                  }}
                  placeholder="123456"
                  className="w-full text-center text-2xl font-bold tracking-[0.4em] py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition"
                />
                {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
              </div>

              <button
                type="button"
                onClick={() => verifyCode(otpCode)}
                disabled={otpCode.length < 6}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Vérifier le code →
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => { setStage('email'); setOtpCode(''); setError(null); }}
                  className="hover:text-slate-600 transition"
                >
                  ← Changer d'email
                </button>
                {resendCooldown > 0 ? (
                  <span>Renvoyer dans {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendCode(email)}
                    className="hover:text-slate-600 transition"
                  >
                    Renvoyer le code
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
