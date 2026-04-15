// Edge Function: cron-purge
// Triggered daily by Supabase Cron (03:00 UTC).
// Applies 5 TTL rules to clean up stale rapports and their Storage assets.
//
// Rules:
//   R1 — draft           + created_at > 24h  → purge total (DB + source photos)
//   R2 — payment_pending + created_at > 1h   → purge total (idem)
//   R3 — email_delivered + last 'delivered' event > 48h → delete ZIP + status=purged
//   R4 — zip_created/email_failed + created_at > 72h    → delete ZIP + status=purged
//   R5 — email_sent      + last 'sent' event > 7 days   → delete ZIP + status=purged
//
// The PDF in rapports-finaux is NEVER touched by this cron.
// Idempotent by design: SQL filters on status+date, Storage removals are no-op if file is gone.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Extract all non-empty photo URLs from the rapport data JSONB blob
// (copied from zip-and-send — source of truth for photo URL extraction)
function extractPhotoUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const compteurs = (data.compteurs as Array<{ photo_url?: string }>) ?? [];
  for (const c of compteurs) {
    if (c.photo_url) urls.push(c.photo_url);
  }
  const pieces =
    (data.pieces as Array<{
      photo_url?: string;
      elements?: Array<{ photo_url?: string }>;
    }>) ?? [];
  for (const piece of pieces) {
    if (piece.photo_url) urls.push(piece.photo_url);
    for (const el of piece.elements ?? []) {
      if (el.photo_url) urls.push(el.photo_url);
    }
  }
  return [...new Set(urls)];
}

// Extract storage path from a Supabase public URL
// e.g. https://xxx.supabase.co/storage/v1/object/public/photos-etats-des-lieux/foo/bar.jpg
// → { bucket: 'photos-etats-des-lieux', path: 'foo/bar.jpg' }
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
  if (!match) return null;
  return { bucket: match[1], path: match[2] };
}

// Delete all source photos referenced in rapport data
async function deleteSourcePhotos(
  data: Record<string, unknown>,
  errors: string[],
): Promise<number> {
  const urls = extractPhotoUrls(data);
  if (urls.length === 0) return 0;

  const paths = urls
    .map(parseStorageUrl)
    .filter(
      (p): p is { bucket: string; path: string } =>
        p !== null && p.bucket === 'photos-etats-des-lieux',
    )
    .map((p) => p.path);

  if (paths.length === 0) return 0;

  const { error } = await supabase.storage.from('photos-etats-des-lieux').remove(paths);
  if (error) {
    errors.push(`deleteSourcePhotos: ${error.message}`);
    console.warn('deleteSourcePhotos error:', error.message);
    return 0;
  }
  return paths.length;
}

// Delete the ZIP for a given rapport and mark it as purged
async function deleteZipAndMarkPurged(rapportId: string, errors: string[]): Promise<void> {
  const zipPath = `${rapportId}/dossier-photos.zip`;
  // Storage remove is no-op if file doesn't exist — safe to call unconditionally
  const { error: storageError } = await supabase.storage
    .from('edl-zips')
    .remove([zipPath]);
  if (storageError) {
    // Log but don't abort — the ZIP may already be gone; DB update still needed
    console.warn(`deleteZip(${rapportId}): ${storageError.message}`);
    errors.push(`deleteZip(${rapportId}): ${storageError.message}`);
  }

  const { error: dbError } = await supabase
    .from('rapports')
    .update({ status: 'purged' })
    .eq('id', rapportId);
  if (dbError) {
    errors.push(`markPurged(${rapportId}): ${dbError.message}`);
  }
}

// ─── Rule implementations ─────────────────────────────────────────────────────

// R1 — draft > 24h: purge total
async function purgeStaleDrafts(errors: string[]): Promise<number> {
  const { data: rows, error } = await supabase
    .from('rapports')
    .select('id, data')
    .eq('status', 'draft')
    .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error) {
    errors.push(`purgeStaleDrafts SELECT: ${error.message}`);
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    await deleteSourcePhotos(row.data as Record<string, unknown>, errors);
    const { error: delError } = await supabase.from('rapports').delete().eq('id', row.id);
    if (delError) {
      errors.push(`purgeStaleDrafts DELETE(${row.id}): ${delError.message}`);
    } else {
      count++;
    }
  }
  return count;
}

// R2 — payment_pending > 1h: purge total (same logic as drafts, tighter threshold)
async function purgeAbandonedPayments(errors: string[]): Promise<number> {
  const { data: rows, error } = await supabase
    .from('rapports')
    .select('id, data')
    .eq('status', 'payment_pending')
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (error) {
    errors.push(`purgeAbandonedPayments SELECT: ${error.message}`);
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    await deleteSourcePhotos(row.data as Record<string, unknown>, errors);
    const { error: delError } = await supabase.from('rapports').delete().eq('id', row.id);
    if (delError) {
      errors.push(`purgeAbandonedPayments DELETE(${row.id}): ${delError.message}`);
    } else {
      count++;
    }
  }
  return count;
}

// R3 — email_delivered + last 'delivered' event > 48h: delete ZIP + purged
async function purgeDeliveredZips(errors: string[]): Promise<number> {
  // Use LATERAL join to find the most recent 'delivered' event per rapport
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Supabase JS doesn't support LATERAL — use rpc or manual approach:
  // Fetch candidates, then verify the latest event timestamp in JS
  const { data: rows, error } = await supabase
    .from('rapports')
    .select('id')
    .eq('status', 'email_delivered');

  if (error) {
    errors.push(`purgeDeliveredZips SELECT rapports: ${error.message}`);
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    const { data: events, error: evErr } = await supabase
      .from('email_events')
      .select('created_at')
      .eq('rapport_id', row.id)
      .eq('event_type', 'delivered')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (evErr) {
      errors.push(`purgeDeliveredZips events(${row.id}): ${evErr.message}`);
      continue;
    }
    if (!events) continue; // no delivered event found — skip
    if (events.created_at > cutoff) continue; // too recent

    await deleteZipAndMarkPurged(row.id, errors);
    count++;
  }
  return count;
}

// R4 — zip_created/email_failed + created_at > 72h: delete ZIP + purged
// These statuses are normally transient (reached within minutes of creation).
// > 72h means something got stuck (webhook missed, email permanently failed).
async function purgeStaleZips(errors: string[]): Promise<number> {
  const { data: rows, error } = await supabase
    .from('rapports')
    .select('id')
    .in('status', ['zip_created', 'email_failed'])
    .lt('created_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

  if (error) {
    errors.push(`purgeStaleZips SELECT: ${error.message}`);
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    await deleteZipAndMarkPurged(row.id, errors);
    count++;
  }
  return count;
}

// R5 — email_sent + last 'sent' event > 7 days: delete ZIP + purged
// Safety net for cases where the Resend 'delivered' webhook never fired.
async function purgeStuckEmailSent(errors: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('rapports')
    .select('id')
    .eq('status', 'email_sent');

  if (error) {
    errors.push(`purgeStuckEmailSent SELECT rapports: ${error.message}`);
    return 0;
  }
  if (!rows || rows.length === 0) return 0;

  let count = 0;
  for (const row of rows) {
    const { data: event, error: evErr } = await supabase
      .from('email_events')
      .select('created_at')
      .eq('rapport_id', row.id)
      .eq('event_type', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (evErr) {
      errors.push(`purgeStuckEmailSent events(${row.id}): ${evErr.message}`);
      continue;
    }
    if (!event) continue;
    if (event.created_at > cutoff) continue; // still within 7 days

    await deleteZipAndMarkPurged(row.id, errors);
    count++;
  }
  return count;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  // ── Auth: CRON_SECRET ──────────────────────────────────────────────────────
  const expectedSecret = Deno.env.get('CRON_SECRET');
  const receivedSecret = req.headers.get('x-cron-secret');
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  // ── Run all 5 rules ────────────────────────────────────────────────────────
  const errors: string[] = [];

  console.log('[cron-purge] starting run at', new Date().toISOString());

  const [
    draftsPurged,
    paymentPendingPurged,
    zipDeliveredPurged,
    zipStalePurged,
    zipSentStuckPurged,
  ] = await Promise.all([
    purgeStaleDrafts(errors),
    purgeAbandonedPayments(errors),
    purgeDeliveredZips(errors),
    purgeStaleZips(errors),
    purgeStuckEmailSent(errors),
  ]);

  const summary = {
    draftsPurged,
    paymentPendingPurged,
    zipDeliveredPurged,
    zipStalePurged,
    zipSentStuckPurged,
    errors,
  };

  console.log('[cron-purge] done:', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
