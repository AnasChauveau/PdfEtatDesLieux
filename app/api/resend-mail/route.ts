// Next.js API Route: POST /api/resend-mail
// Triggered by the "Je n'ai pas reçu le mail" button.
// Re-sends the email(s) with optional email address correction.
// Uses SUPABASE_SERVICE_ROLE_KEY — server-side only.

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Extract path from a Supabase Storage public URL (edl-zips bucket)
function extractZipPath(rapportId: string): string {
  return `${rapportId}/dossier-photos.zip`;
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  pdfBase64: string;
  pdfFilename: string;
  apiKey: string;
  from: string;
}): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      attachments: [{ filename: params.pdfFilename, content: params.pdfBase64 }],
    }),
  });
  if (!res.ok) return null;
  const json = await res.json() as { id: string };
  return json.id;
}

function buildResendHtml(params: {
  role: 'bailleur' | 'locataire';
  adresse: string;
  typeEdl: string;
  zipSignedUrl: string | null;
  isPurged: boolean;
}): string {
  const roleIntro =
    params.role === 'bailleur'
      ? 'En tant que <strong>bailleur</strong>, vous trouverez ci-joint'
      : 'En tant que <strong>locataire</strong>, vous trouverez ci-joint';

  if (params.isPurged) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2>État des lieux — ${params.adresse}</h2>
        <p>${roleIntro} le PDF de l'état des lieux <strong>${params.typeEdl.toLowerCase()}</strong>
        du bien situé au <strong>${params.adresse}</strong>.</p>
        <p>📄 <strong>PDF joint</strong> — document légal de référence.</p>
        <p style="color:#888;font-size:12px;">
          Les photos originales ont été supprimées conformément à notre politique Zéro Déchet.
          Le PDF reste votre document légal de référence.
        </p>
      </div>`;
  }

  const zipSection = params.zipSignedUrl
    ? `<p>📦 <strong>Dossier photos</strong> (lien valable 48h) :<br>
       <a href="${params.zipSignedUrl}">${params.zipSignedUrl}</a></p>
       <p style="color:#888;font-size:12px;">
         Les photos seront automatiquement supprimées 48h après livraison.
         Passé ce délai, seul le PDF joint fait foi.
       </p>`
    : `<p style="color:#888;font-size:12px;">Aucune photo n'a été jointe à cet état des lieux.</p>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2>État des lieux — ${params.adresse}</h2>
      <p>${roleIntro} le PDF de l'état des lieux <strong>${params.typeEdl.toLowerCase()}</strong>
      du bien situé au <strong>${params.adresse}</strong>.</p>
      <p>📄 <strong>PDF joint</strong> — document légal de référence.</p>
      ${zipSection}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#888;font-size:12px;">
        Renvoi suite à votre demande. Ce message a été envoyé par État des Lieux Pro.
      </p>
    </div>`;
}

export async function POST(req: NextRequest) {
  // Initialize inside handler — avoids build-time env var errors
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const resendApiKey = process.env.RESEND_API_KEY!;
  const resendFrom = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

  let rapportId: string;
  let newBailleurEmail: string | undefined;
  let newLocataireEmail: string | undefined;

  try {
    const body = await req.json();
    rapportId = body.rapportId;
    newBailleurEmail = body.bailleurEmail;
    newLocataireEmail = body.locataireEmail;
    if (!rapportId) throw new Error('Missing rapportId');
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Fetch rapport
  const { data: rapport, error } = await supabase
    .from('rapports')
    .select('id, status, data, pdf_url, bailleur_email, client_email, adresse_bien, type_edl')
    .eq('id', rapportId)
    .single();

  if (error || !rapport) {
    return NextResponse.json({ error: 'Rapport not found' }, { status: 404 });
  }

  // Debounce : refuser si un renvoi a eu lieu dans les 30 dernières secondes
  const { data: lastResent } = await supabase
    .from('email_events')
    .select('created_at')
    .eq('rapport_id', rapportId)
    .eq('event_type', 'resent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastResent) {
    const elapsed = Date.now() - new Date(lastResent.created_at).getTime();
    if (elapsed < 30_000) {
      return NextResponse.json(
        { error: 'Veuillez patienter avant de renvoyer.' },
        { status: 429 },
      );
    }
  }

  const isPurged = rapport.status === 'purged';
  const adresse = rapport.adresse_bien as string;
  const typeEdl = rapport.type_edl as string;
  const bailleurEmail = newBailleurEmail ?? (rapport.bailleur_email as string);
  const locataireEmail = newLocataireEmail ?? (rapport.client_email as string);
  const subject = `[Renvoi] État des lieux ${typeEdl.toLowerCase()} — ${adresse}`;
  const pdfFilename = `etat-des-lieux-${adresse.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;

  // Download PDF
  const { data: pdfBlob, error: pdfErr } = await supabase.storage
    .from('rapports-finaux')
    .download(rapport.pdf_url as string);

  if (pdfErr || !pdfBlob) {
    return NextResponse.json({ error: 'PDF unavailable' }, { status: 500 });
  }

  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  // Generate fresh signed URL for ZIP (if not purged)
  let zipSignedUrl: string | null = null;
  if (!isPurged) {
    const zipPath = extractZipPath(rapportId);
    const { data: signedData } = await supabase.storage
      .from('edl-zips')
      .createSignedUrl(zipPath, 60 * 60 * 24 * 7); // 7 days
    zipSignedUrl = signedData?.signedUrl ?? null;
  }

  // Send to bailleur
  const bailleurEmailId = await sendEmail({
    to: bailleurEmail,
    subject,
    html: buildResendHtml({ role: 'bailleur', adresse, typeEdl, zipSignedUrl, isPurged }),
    pdfBase64,
    pdfFilename,
    apiKey: resendApiKey,
    from: resendFrom,
  });

  // Send to locataire
  const locataireEmailId = await sendEmail({
    to: locataireEmail,
    subject,
    html: buildResendHtml({ role: 'locataire', adresse, typeEdl, zipSignedUrl, isPurged }),
    pdfBase64,
    pdfFilename,
    apiKey: resendApiKey,
    from: resendFrom,
  });

  if (!bailleurEmailId && !locataireEmailId) {
    return NextResponse.json({ error: 'Email send failed' }, { status: 502 });
  }

  // Log resent events
  const events = [];
  if (bailleurEmailId)
    events.push({ rapport_id: rapportId, event_type: 'resent', resend_email_id: bailleurEmailId, payload: { to: bailleurEmail } });
  if (locataireEmailId)
    events.push({ rapport_id: rapportId, event_type: 'resent', resend_email_id: locataireEmailId, payload: { to: locataireEmail } });

  if (events.length > 0) await supabase.from('email_events').insert(events);

  // Update emails in DB if they were corrected
  if (newBailleurEmail || newLocataireEmail) {
    const updates: Record<string, string> = {};
    if (newBailleurEmail) updates.bailleur_email = newBailleurEmail;
    if (newLocataireEmail) updates.client_email = newLocataireEmail;
    await supabase.from('rapports').update(updates).eq('id', rapportId);
  }

  return NextResponse.json({ success: true });
}
