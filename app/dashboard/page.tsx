'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RapportStatus } from '@/lib/types';
import { FileText, Download, Plus, Loader2, Home, ArrowRight } from 'lucide-react';

interface Rapport {
  id: string;
  adresse_bien: string;
  type_edl: string;
  status: RapportStatus;
  created_at: string;
  pdf_url: string | null;
}

const STATUS_LABELS: Record<RapportStatus, { label: string; className: string }> = {
  draft:           { label: 'Brouillon',        className: 'bg-slate-100 text-slate-600' },
  pdf_generated:   { label: 'PDF généré',       className: 'bg-blue-100 text-blue-700' },
  zip_created:     { label: 'Dossier créé',     className: 'bg-blue-100 text-blue-700' },
  email_sent:      { label: 'Email envoyé',     className: 'bg-green-100 text-green-700' },
  email_delivered: { label: 'Livré',            className: 'bg-green-100 text-green-700' },
  email_failed:    { label: 'Échec envoi',      className: 'bg-red-100 text-red-700' },
  purged:          { label: 'Archivé',          className: 'bg-slate-100 text-slate-500' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function DashboardPage() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [loading, setLoading] = useState(true);
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('rapports')
        .select('id, adresse_bien, type_edl, status, created_at, pdf_url')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Dashboard fetch error:', error.message);
        setLoading(false);
        return;
      }

      const rows: Rapport[] = data ?? [];
      setRapports(rows);
      setLoading(false);

      // Générer les URLs signées pour les PDFs disponibles
      const urlMap: Record<string, string> = {};
      await Promise.all(
        rows
          .filter(r => r.pdf_url)
          .map(async (r) => {
            const { data: signed } = await supabase.storage
              .from('rapports-finaux')
              .createSignedUrl(r.pdf_url!, 3600);
            if (signed?.signedUrl) urlMap[r.id] = signed.signedUrl;
          })
      );
      setPdfUrls(urlMap);
    };

    load();
  }, []);

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Mes états des lieux</h1>
        <a
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition"
        >
          <Plus size={15} />
          Nouvel EDL
        </a>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      )}

      {!loading && rapports.length === 0 && (
        <div className="text-center py-16 flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <FileText size={24} className="text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-700">Aucun état des lieux pour l'instant</p>
            <p className="text-sm text-slate-400 mt-1">Créez votre premier EDL en quelques minutes.</p>
          </div>
          <a
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition"
          >
            Créer mon premier EDL <ArrowRight size={14} />
          </a>
        </div>
      )}

      {!loading && rapports.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rapports.map((r) => {
            const badge = STATUS_LABELS[r.status] ?? STATUS_LABELS.draft;
            const pdfHref = pdfUrls[r.id];
            return (
              <li
                key={r.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3 shadow-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Home size={16} className="text-slate-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {r.adresse_bien || 'Adresse non renseignée'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-500">{r.type_edl}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>

                {pdfHref ? (
                  <a
                    href={pdfHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition px-2.5 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 shrink-0"
                  >
                    <Download size={13} />
                    PDF
                  </a>
                ) : (
                  <span className="text-xs text-slate-300 px-2.5 py-1.5 shrink-0">Pas de PDF</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
