// Edge Function: zip-and-send
// Triggered by the frontend after pdf_generated status.
// Downloads all photos, compresses them, zips them, uploads the ZIP,
// then sends emails to both bailleur and locataire via Resend.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';
// @ts-ignore — JSZip has no Deno types but works fine via npm:
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

// Download a photo, resize to max 2000×2000, re-encode as JPEG quality 85.
// Returns { bytes } on success or { error } on failure — never swallows silently.
async function compressPhoto(url: string): Promise<{ bytes: Uint8Array } | { error: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: `HTTP ${res.status} ${res.statusText}` };
    const raw = new Uint8Array(await res.arrayBuffer());
    const img = await Image.decode(raw);
    if (img.width > 2000 || img.height > 2000) {
      img.resize(2000, Image.RESIZE_AUTO);
    }
    const bytes = await img.encodeJPEG(85);
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
    from: RESEND_FROM_EMAIL,
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

// Build the email HTML body — differentiated content for bailleur vs locataire
function buildEmailHtml(params: {
  role: 'bailleur' | 'locataire';
  adresse: string;
  typeEdl: string;
  date: string;
  zipSignedUrl: string | null;
}): string {
  const roleLabel = params.role === 'bailleur' ? 'bailleur' : 'locataire';
  const roleIntro =
    params.role === 'bailleur'
      ? 'En tant que <strong>bailleur</strong>, vous trouverez ci-joint'
      : 'En tant que <strong>locataire</strong>, vous trouverez ci-joint';

  const zipSection = params.zipSignedUrl
    ? `
      <p>
        📦 <strong>Dossier photos</strong> (lien valable 48h après réception) :<br>
        <a href="${params.zipSignedUrl}">${params.zipSignedUrl}</a>
      </p>
      <p style="color:#888;font-size:12px;">
        Les photos seront automatiquement supprimées 48h après livraison, conformément
        à notre politique Zéro Déchet. Pensez à les télécharger avant cette date.<br>
        Passé ce délai, seul le PDF joint fait foi comme document contradictoire.
      </p>`
    : `<p style="color:#888;font-size:12px;">Aucune photo n'a été jointe à cet état des lieux.</p>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1a1a1a">État des lieux — ${params.adresse}</h2>
      <p>${roleIntro} le PDF de l'état des lieux <strong>${params.typeEdl.toLowerCase()}</strong>
      du bien situé au <strong>${params.adresse}</strong>, établi le ${params.date}.</p>
      <p>
        📄 <strong>PDF joint</strong> — document légal de référence, conservé 9 ans.
      </p>
      ${zipSection}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#888;font-size:12px;">
        Ce message a été envoyé automatiquement par État des Lieux Pro.<br>
        Le présent état des lieux a été établi contradictoirement entre les parties,
        qui reconnaissent en avoir reçu un exemplaire.
      </p>
    </div>`;
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
    .select('id, status, data, pdf_url, bailleur_email, client_email, adresse_bien, type_edl')
    .eq('id', rapportId)
    .single();

  if (fetchError || !rapport) {
    return new Response(JSON.stringify({ error: 'Rapport not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 2. Guard — idempotence: only process from pdf_generated
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
      const result = await compressPhoto(url);
      if ('bytes' in result) {
        zip.file(fileName, result.bytes);
        console.log(`[photo ${i + 1}/${photoUrls.length}] OK — ${result.bytes.length} bytes`);
      } else {
        console.error(`[photo ${i + 1}/${photoUrls.length}] FAILED: ${result.error}`);
        photoErrors.push(`${fileName} — source: ${url} — erreur: ${result.error}`);
      }
    }

    if (photoErrors.length > 0) {
      const errorList = photoErrors.join('\n');
      zip.file('ERREURS.txt', `Photos manquantes dans ce dossier :\n\n${errorList}`);
      console.warn(`${photoErrors.length} photo(s) failed — ERREURS.txt added to ZIP`);
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

    // 9. Generate signed URL (7 days — ZIP physically deleted by cron 48h after email_delivered)
    const { data: signedData } = await supabase.storage
      .from('edl-zips')
      .createSignedUrl(zipPath, 60 * 60 * 24 * 7);
    zipSignedUrl = signedData?.signedUrl ?? null;
  } else {
    // No photos — skip ZIP, transition directly
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
  const subject = `État des lieux ${typeEdl.toLowerCase()} — ${adresse}`;

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
    // Both failed — keep at zip_created so frontend can retry
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
