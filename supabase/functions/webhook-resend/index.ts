// Edge Function: webhook-resend
// Receives delivery status webhooks from Resend (via Svix).
// Verifies the signature, logs in email_events, and updates rapport status.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Verify Svix webhook signature using Web Crypto (no external lib required).
// Svix signs: "{svix-id}.{svix-timestamp}.{rawBody}"
// Signature header may contain multiple comma-separated values (v1,<base64>).
async function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject messages older than 5 minutes (replay attack protection)
  const msgTimestamp = parseInt(svixTimestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - msgTimestamp) > 300) return false;

  // The signed content
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;

  // Decode the secret (Svix secrets are base64url-encoded after "whsec_" prefix)
  const secretBytes = Uint8Array.from(
    atob(secret.replace(/^whsec_/, '')),
    (c) => c.charCodeAt(0),
  );

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // svix-signature may contain multiple sigs: "v1,<base64> v1,<base64>"
  const receivedSigs = svixSignature
    .split(' ')
    .map((s) => s.replace(/^v1,/, '').trim());

  return receivedSigs.some((sig) => sig === computedSig);
}

// Map Resend event types to our email_events event_type values
function mapEventType(
  resendType: string,
): 'sent' | 'delivered' | 'bounced' | 'complained' | 'resent' | null {
  switch (resendType) {
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    default:
      return null; // log-only events (opened, clicked, etc.)
  }
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

  // Read raw body first (needed for signature verification)
  const rawBody = await req.text();

  // Verify Svix signature
  const isValid = await verifyWebhookSignature(rawBody, req.headers, RESEND_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let payload: { type: string; data: { email_id?: string; [key: string]: unknown } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  const resendEmailId = payload.data?.email_id ?? null;
  const eventType = mapEventType(payload.type);

  // Find the matching email_event row to get rapport_id
  let rapportId: string | null = null;
  if (resendEmailId) {
    const { data: emailEvent } = await supabase
      .from('email_events')
      .select('rapport_id')
      .eq('resend_email_id', resendEmailId)
      .maybeSingle();
    rapportId = emailEvent?.rapport_id ?? null;
  }

  if (rapportId && eventType) {
    // Log the event
    await supabase.from('email_events').insert({
      rapport_id: rapportId,
      event_type: eventType,
      resend_email_id: resendEmailId,
      payload: payload.data as Record<string, unknown>,
    });

    // Transition rapport status
    if (eventType === 'delivered') {
      // Only advance from email_sent — never regress a further status
      await supabase
        .from('rapports')
        .update({ status: 'email_delivered' })
        .eq('id', rapportId)
        .eq('status', 'email_sent');
    } else if (eventType === 'bounced' || eventType === 'complained') {
      // Only set email_failed if not already delivered
      await supabase
        .from('rapports')
        .update({ status: 'email_failed' })
        .eq('id', rapportId)
        .in('status', ['email_sent', 'zip_created']);
    }
  } else if (resendEmailId && eventType) {
    // Unknown email_id — log without rapport_id for audit
    console.warn(`No email_event found for resend_email_id=${resendEmailId}`);
  }

  // Always return 200 to prevent Resend from retrying
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
});
