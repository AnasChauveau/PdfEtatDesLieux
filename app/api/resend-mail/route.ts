// Next.js API Route: POST /api/resend-mail
// Triggered by the "Je n'ai pas reçu le mail" button.
// Re-sends the email(s) with optional email address correction.
// Uses SUPABASE_SERVICE_ROLE_KEY - server-side only.

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
  let zipSection: string;
  if (params.isPurged) {
    zipSection = `<p style="color:#6b7280;font-family:sans-serif;font-size:13px;line-height:20px;margin-bottom:16px;">
      Les photos originales ont été supprimées conformément à notre politique Zéro Déchet.<br>
      Le PDF joint reste votre document légal de référence.
    </p>`;
  } else if (params.zipSignedUrl) {
    zipSection = `
      <div class="warning">
        <p class="warning-text">⚠️ <strong>Téléchargez vos photos maintenant.</strong><br>
        Ce lien expire dans 48h. Passé ce délai, les photos seront définitivement supprimées conformément à notre politique Zéro Déchet.</p>
      </div>
      <a href="${params.zipSignedUrl}" class="zip-link">📦 Télécharger le dossier photos</a>
      <p style="color:#6b7280;font-family:sans-serif;font-size:12px;text-align:center;margin-top:4px;margin-bottom:16px;">
        Lien direct : <a href="${params.zipSignedUrl}" style="color:#2563eb;word-break:break-all;">${params.zipSignedUrl}</a>
      </p>`;
  } else {
    zipSection = `<p style="color:#6b7280;font-family:sans-serif;font-size:13px;margin-bottom:16px;">Aucune photo n'a été jointe à cet état des lieux.</p>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{margin:0;padding:0;width:100%!important;background-color:#f9fafb}
    .wrapper{width:100%;background-color:#f9fafb;padding:20px 0 40px}
    .container{max-width:450px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1)}
    .logo{color:#2563eb;font-family:sans-serif;font-size:20px;font-weight:800;letter-spacing:-.5px;margin-bottom:24px;text-align:center;text-transform:lowercase}
    .title{color:#111827;font-family:sans-serif;font-size:20px;font-weight:700;margin:0 0 16px}
    .info-block{background-color:#f3f4f6;border-radius:8px;padding:12px 16px;margin-bottom:12px}
    .info-label{color:#6b7280;font-family:sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:0 0 2px}
    .info-value{color:#111827;font-family:sans-serif;font-size:14px;font-weight:600;margin:0}
    .pdf-note{background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#1e40af;font-family:sans-serif;font-size:14px}
    .zip-link{display:block;background-color:#2563eb;color:#ffffff!important;font-family:sans-serif;font-size:15px;font-weight:700;text-align:center;padding:12px 20px;border-radius:8px;text-decoration:none;margin-bottom:8px}
    .warning{background-color:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;margin-bottom:12px}
    .warning-text{color:#92400e;font-family:sans-serif;font-size:13px;line-height:20px;margin:0}
    .footer{color:#9ca3af;font-family:sans-serif;font-size:12px;text-align:center;margin-top:24px;padding:0 20px;line-height:20px}
    @media screen and (max-width:380px){.container{padding:16px!important;margin:10px!important}.title{font-size:18px!important}}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="logo">express-edl</div>
      <h1 class="title">Renvoi de votre état des lieux</h1>
      <div class="info-block">
        <p class="info-label">Bien</p>
        <p class="info-value">${params.adresse}</p>
      </div>
      <div class="info-block">
        <p class="info-label">Type</p>
        <p class="info-value">${params.typeEdl}</p>
      </div>
      <div class="info-block">
        <p class="info-label">Destinataire</p>
        <p class="info-value">${params.role === 'bailleur' ? 'Bailleur' : 'Locataire'}</p>
      </div>
      <div class="pdf-note">📄 <strong>PDF joint</strong> — document légal de référence, conservé 9 ans.</div>
      ${zipSection}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#6b7280;font-family:sans-serif;font-size:12px;line-height:18px;margin:0">
        Renvoi suite à votre demande. Ce message a été envoyé par Express EDL.
      </p>
    </div>
    <div class="footer">© 2026 Express EDL — L'état des lieux rapide et pro.</div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  // Initialize inside handler - avoids build-time env var errors
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
  const subject = `[Renvoi] État des lieux ${typeEdl.toLowerCase()} - ${adresse}`;
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
    from: `Express EDL <${resendFrom}>`,
  });

  // Send to locataire
  const locataireEmailId = await sendEmail({
    to: locataireEmail,
    subject,
    html: buildResendHtml({ role: 'locataire', adresse, typeEdl, zipSignedUrl, isPurged }),
    pdfBase64,
    pdfFilename,
    apiKey: resendApiKey,
    from: `Express EDL <${resendFrom}>`,
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
