'use client';

// Page intermédiaire après le Magic Link.
// Scénario normal : l'onglet original est toujours ouvert et a déjà reçu l'événement
// SIGNED_IN via onAuthStateChange. Cette page s'en rend compte et invite à fermer l'onglet.
// Scénario fallback : l'onglet original a été fermé → on restaure le draft depuis localStorage.

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Loader2 } from 'lucide-react';

// Délai max (ms) pour que l'onglet original pose le flag SIGNED_IN
const WAIT_MS = 1200;

function AuthDoneContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const restoreDraft = searchParams.get('restoreDraft') === 'true';

  // 'checking' → 'original_alive' | 'fallback'
  const [state, setState] = useState<'checking' | 'original_alive' | 'fallback'>('checking');

  useEffect(() => {
    // Attendre que l'onglet original ait le temps de traiter SIGNED_IN et de poser son flag
    const timer = setTimeout(() => {
      const raw = localStorage.getItem('edl_auth_handled');
      if (raw) {
        const ts = parseInt(raw, 10);
        // Flag posé il y a moins de 30 secondes → onglet original vivant
        if (Date.now() - ts < 30_000) {
          localStorage.removeItem('edl_auth_handled');
          setState('original_alive');
          return;
        }
      }
      // Aucun flag récent → l'onglet original n'est plus là, on redirige vers le draft
      setState('fallback');
    }, WAIT_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (state === 'fallback') {
      // Rediriger vers / avec le flag restoreDraft si un draft est en attente
      router.replace(restoreDraft ? '/?restoreDraft=true' : '/');
    }
  }, [state, restoreDraft, router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      {state === 'checking' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Vérification de la connexion…</p>
        </div>
      )}

      {state === 'original_alive' && (
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center flex flex-col items-center gap-4">
          <CheckCircle size={48} className="text-green-500" />
          <h1 className="text-xl font-bold text-slate-800">Vous êtes connecté !</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Votre formulaire a été mis à jour dans l'onglet précédent.
            <br />
            Vous pouvez fermer cet onglet et continuer là-bas.
          </p>
          {/* Fallback si l'utilisateur ne voit pas l'autre onglet */}
          {restoreDraft && (
            <a
              href="/?restoreDraft=true"
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Ou reprendre ici si l'autre onglet est fermé (photo perdu dans ce cas) →
            </a>
          )}
        </div>
      )}

      {state === 'fallback' && (
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Restauration de votre formulaire…</p>
        </div>
      )}
    </main>
  );
}

export default function AuthDonePage() {
  return (
    <Suspense fallback={
      <main className="min-h-[60vh] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </main>
    }>
      <AuthDoneContent />
    </Suspense>
  );
}
