'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { LogOut, LayoutDashboard, LogIn } from 'lucide-react';

interface HeaderProps {
  edlInProgress?: boolean;
}

export default function Header({ edlInProgress = false }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [signoutBlocked, setSignoutBlocked] = useState(false);

  useEffect(() => {
    // Lecture initiale de la session
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));

    // Mise à jour en temps réel (multi-onglets, retour après Magic Link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignoutClick = (e: React.MouseEvent) => {
    if (edlInProgress) {
      e.preventDefault();
      setSignoutBlocked(true);
      // Masquer le message après 4 secondes
      setTimeout(() => setSignoutBlocked(false), 4000);
    }
  };

  return (
    <header className="w-full bg-slate-900 text-white px-4 py-2.5">
      <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
        {/* Marque - lien vers l'accueil */}
        <a href="/" className="text-sm font-bold tracking-tight hover:text-slate-300 transition">
          Express EDL
        </a>

        {/* Actions auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden sm:block text-xs text-slate-400 truncate max-w-[160px]">
                {user.email}
              </span>
              <a
                href="/dashboard"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition px-2 py-1 rounded-lg hover:bg-slate-700"
              >
                <LayoutDashboard size={13} />
                <span className="hidden sm:inline">Mes EDL</span>
              </a>

              {/* Déconnexion : form POST vers /auth/signout */}
              <form
                action="/auth/signout"
                method="POST"
                onSubmit={(e) => {
                  if (edlInProgress) {
                    e.preventDefault();
                    setSignoutBlocked(true);
                    setTimeout(() => setSignoutBlocked(false), 4000);
                  }
                }}
              >
                <button
                  type="submit"
                  onClick={handleSignoutClick}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition px-2 py-1 rounded-lg hover:bg-slate-700"
                >
                  <LogOut size={13} />
                  <span className="hidden sm:inline">Déconnexion</span>
                </button>
              </form>

              {/* Message de blocage si EDL en cours */}
              {signoutBlocked && (
                <span className="text-xs text-amber-300 font-medium">
                  Terminez votre EDL avant de vous déconnecter
                </span>
              )}
            </>
          ) : (
            <a
              href="/login"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition px-2 py-1 rounded-lg hover:bg-slate-700"
            >
              <LogIn size={13} />
              Se connecter
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
