// Edge Function: zip-and-send
// Triggered by the frontend after pdf_generated status.
// Downloads all photos, compresses them, zips them, uploads the ZIP,
// then sends emails to both bailleur and locataire via Resend.

import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-ignore - JSZip has no Deno types but works fine via npm:
import JSZip from 'npm:jszip@3';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Extract all non-empty photo URLs from the rapport data JSONB blob
function extractPhotoUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const compteurs = data.compteurs as Array<{ photo_url?: string }> ?? [];
  for (const c of compteurs) {
    if (c.photo_url) urls.push(c.photo_url);
  }
  const pieces = data.pieces as Array<{ photo_url?: string; elements?: Array<{ photo_url?: string }> }> ?? [];
  for (const piece of pieces) {
    if (piece.photo_url) urls.push(piece.photo_url);
    for (const el of piece.elements ?? []) {
      if (el.photo_url) urls.push(el.photo_url);
    }
  }
  return [...new Set(urls)]; // deduplicate
}

// Extract the storage path from a public Supabase Storage URL.
// e.g. https://xxx.supabase.co/storage/v1/object/public/photos-etats-des-lieux/foo/bar.jpg
// → { bucket: 'photos-etats-des-lieux', path: 'foo/bar.jpg' }
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

// Photos are pre-compressed client-side (≤1600px, ≤800Ko, JPEG) - no server processing needed.
// Returns { bytes } on success or { error } on failure - never swallows silently.
async function fetchPhoto(url: string): Promise<{ bytes: Uint8Array } | { error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes };
  } catch (e) {
    return { error: String(e) };
  }
}

// Send an email via Resend REST API. Returns the Resend email ID on success.
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  pdfBase64: string;
  pdfFilename: string;
}): Promise<string | null> {
  const body = {
    from: `Express EDL <${RESEND_FROM_EMAIL}>`,
    to: [params.to],
    subject: params.subject,
    html: params.html,
    attachments: [
      {
        filename: params.pdfFilename,
        content: params.pdfBase64,
      },
    ],
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return null;
  }
  const json = await res.json() as { id: string };
  return json.id;
}

// Log an email send event in email_events
async function logEmailEvent(rapportId: string, resendEmailId: string) {
  await supabase.from('email_events').insert({
    rapport_id: rapportId,
    event_type: 'sent',
    resend_email_id: resendEmailId,
    payload: {},
  });
}

// Build the email HTML body - differentiated content for bailleur vs locataire
function buildEmailHtml(params: {
  role: 'bailleur' | 'locataire';
  adresse: string;
  typeEdl: string;
  date: string;
  zipSignedUrl: string | null;
}): string {
  const zipSection = params.zipSignedUrl
    ? `
      <div class="warning">
        <p class="warning-text">⚠️ <strong>Téléchargez vos photos maintenant.</strong><br>
        Ce lien expire dans 48h. Passé ce délai, les photos seront définitivement supprimées conformément à notre politique Zéro Déchet.</p>
      </div>
      <a href="${params.zipSignedUrl}" class="zip-link">📦 Télécharger le dossier photos</a>
      <p style="color:#6b7280;font-family:sans-serif;font-size:12px;text-align:center;margin-top:4px;margin-bottom:16px;">
        Lien direct : <a href="${params.zipSignedUrl}" style="color:#2563eb;word-break:break-all;">${params.zipSignedUrl}</a>
      </p>`
    : `<p style="color:#6b7280;font-family:sans-serif;font-size:13px;margin-bottom:16px;">Aucune photo n'a été jointe à cet état des lieux.</p>`;

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
      <h1 class="title">Votre état des lieux est prêt</h1>
      <div class="info-block">
        <p class="info-label">Bien</p>
        <p class="info-value">${params.adresse}</p>
      </div>
      <div class="info-block">
        <p class="info-label">Type · Date</p>
        <p class="info-value">${params.typeEdl} · ${params.date}</p>
      </div>
      <div class="info-block">
        <p class="info-label">Destinataire</p>
        <p class="info-value">${params.role === 'bailleur' ? 'Bailleur' : 'Locataire'}</p>
      </div>
      <div class="pdf-note">📄 <strong>PDF joint</strong> — document légal de référence, conservé 9 ans.</div>
      ${zipSection}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#6b7280;font-family:sans-serif;font-size:12px;line-height:18px;margin:0">
        Ce message a été envoyé automatiquement par Express EDL.<br>
        Le présent état des lieux a été établi contradictoirement entre les parties, qui reconnaissent en avoir reçu un exemplaire.
      </p>
    </div>
    <div class="footer">© 2026 Express EDL — L'état des lieux rapide et pro.</div>
  </div>
</body>
</html>`;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // Verify JWT - required now that --no-verify-jwt is removed
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  let rapportId: string;
  try {
    const body = await req.json();
    rapportId = body.rapportId;
    if (!rapportId) throw new Error('Missing rapportId');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 1. Fetch the rapport
  const { data: rapport, error: fetchError } = await supabase
    .from('rapports')
    .select('id, status, data, pdf_url, bailleur_email, client_email, adresse_bien, type_edl, user_id')
    .eq('id', rapportId)
    .single();

  if (fetchError || !rapport) {
    return new Response(JSON.stringify({ error: 'Rapport not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 2a. Guard - rapport must belong to the authenticated user
  if (rapport.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 2b. Guard - idempotence: only process from pdf_generated
  if (rapport.status !== 'pdf_generated') {
    return new Response(
      JSON.stringify({ error: 'Already processed', status: rapport.status }),
      { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  // 3. Extract photo URLs from JSONB data
  const photoUrls = extractPhotoUrls(rapport.data as Record<string, unknown>);
  const hasPhotos = photoUrls.length > 0;

  let zipSignedUrl: string | null = null;

  if (hasPhotos) {
    // 4–6. Download, compress, ZIP, upload
    const zip = new JSZip();
    const photoErrors: string[] = [];

    for (const [i, url] of photoUrls.entries()) {
      const fileName = `photo_${String(i + 1).padStart(3, '0')}.jpg`;
      console.log(`[photo ${i + 1}/${photoUrls.length}] processing → ${fileName} | src: ${url}`);
      const result = await fetchPhoto(url);
      if ('bytes' in result) {
        zip.file(fileName, result.bytes);
        console.log(`[photo ${i + 1}/${photoUrls.length}] OK - ${result.bytes.length} bytes`);
      } else {
        console.error(`[photo ${i + 1}/${photoUrls.length}] FAILED: ${result.error}`);
        photoErrors.push(`${fileName} - source: ${url} - erreur: ${result.error}`);
      }
    }

    if (photoErrors.length > 0) {
      const errorList = photoErrors.join('\n');
      zip.file('ERREURS.txt', `Photos manquantes dans ce dossier :\n\n${errorList}`);
      console.warn(`${photoErrors.length} photo(s) failed - ERREURS.txt added to ZIP`);
    }

    const zipBytes: Uint8Array = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const zipPath = `${rapportId}/dossier-photos.zip`;
    const { error: zipUploadError } = await supabase.storage
      .from('edl-zips')
      .upload(zipPath, zipBytes, { contentType: 'application/zip', upsert: true });

    if (zipUploadError) {
      console.error('ZIP upload failed:', zipUploadError);
      return new Response(
        JSON.stringify({ error: 'ZIP upload failed', details: zipUploadError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    // 7. Transition to zip_created
    await supabase
      .from('rapports')
      .update({ status: 'zip_created' })
      .eq('id', rapportId);

    // 8. Delete individual source photos
    const pathsToDelete = photoUrls
      .map(parseStorageUrl)
      .filter((p): p is { bucket: string; path: string } => p !== null && p.bucket === 'photos-etats-des-lieux')
      .map((p) => p.path);

    if (pathsToDelete.length > 0) {
      await supabase.storage.from('photos-etats-des-lieux').remove(pathsToDelete);
    }

    // 9. Generate signed URL (7 days - ZIP physically deleted by cron 48h after email_delivered)
    const { data: signedData } = await supabase.storage
      .from('edl-zips')
      .createSignedUrl(zipPath, 60 * 60 * 24 * 7);
    zipSignedUrl = signedData?.signedUrl ?? null;
  } else {
    // No photos - skip ZIP, transition directly
    await supabase
      .from('rapports')
      .update({ status: 'zip_created' })
      .eq('id', rapportId);
  }

  // 10. Download the PDF
  const { data: pdfData, error: pdfError } = await supabase.storage
    .from('rapports-finaux')
    .download(rapport.pdf_url as string);

  if (pdfError || !pdfData) {
    return new Response(
      JSON.stringify({ error: 'PDF download failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
  const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
  const pdfFilename = `etat-des-lieux-${(rapport.adresse_bien as string).replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;

  // Shared email params
  const adresse = rapport.adresse_bien as string;
  const typeEdl = rapport.type_edl as string;
  const date = (rapport.data as Record<string, unknown>)?.metadata
    ? ((rapport.data as Record<string, { date?: string }>).metadata?.date ?? new Date().toLocaleDateString('fr-FR'))
    : new Date().toLocaleDateString('fr-FR');
  const subject = `État des lieux ${typeEdl.toLowerCase()} - ${adresse}`;

  // 11. Send emails
  const baileurEmailId = await sendEmail({
    to: rapport.bailleur_email as string,
    subject,
    html: buildEmailHtml({ role: 'bailleur', adresse, typeEdl, date, zipSignedUrl }),
    pdfBase64,
    pdfFilename,
  });

  const locataireEmailId = await sendEmail({
    to: rapport.client_email as string,
    subject,
    html: buildEmailHtml({ role: 'locataire', adresse, typeEdl, date, zipSignedUrl }),
    pdfBase64,
    pdfFilename,
  });

  if (!baileurEmailId && !locataireEmailId) {
    // Both failed - keep at zip_created so frontend can retry
    return new Response(
      JSON.stringify({ error: 'Email send failed', canRetry: true }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  // Log email events
  if (baileurEmailId) await logEmailEvent(rapportId, baileurEmailId);
  if (locataireEmailId) await logEmailEvent(rapportId, locataireEmailId);

  // 12. Transition to email_sent
  await supabase
    .from('rapports')
    .update({ status: 'email_sent' })
    .eq('id', rapportId);

  return new Response(
    JSON.stringify({ success: true, status: 'email_sent' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
});
