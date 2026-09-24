// BestBulkSMS (bestbulksms.com.ng) — JSON-over-HTTPS API with Bearer auth.
// Docs: https://bestbulksms.com.ng/app/user/developer
//
// Env vars:
//   BESTBULKSMS_API_KEY    — bearer token from the Developer / API Center page
//   BESTBULKSMS_SENDER     — approved sender ID (e.g. "AMQM")
//   BESTBULKSMS_ROUTE      — optional; defaults to "standard"
//   BESTBULKSMS_SOURCE_URL — optional; the provider asks production
//                            integrations to send a stable source_url so
//                            requests aren't flagged by their abuse review.
//   BESTBULKSMS_ENDPOINT   — optional override of the send endpoint.

const DEFAULT_ENDPOINT   = 'https://www.bestbulksms.com.ng/api/sms/send';
const DEFAULT_SOURCE_URL = 'https://amqm.school/attendance/parent-notification';

export type SmsResult = {
  ok: boolean;
  providerResponse: string;
  to: string;
  message: string;
};

export function normalizeNigerianPhone(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('234') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  if (digits.length === 10) return '234' + digits;
  return digits;
}

export async function sendBestBulkSms(to: string, message: string): Promise<SmsResult> {
  const apiKey    = process.env.BESTBULKSMS_API_KEY || '';
  const senderId  = process.env.BESTBULKSMS_SENDER  || 'AMQM';
  const route     = process.env.BESTBULKSMS_ROUTE   || 'standard';
  const sourceUrl = process.env.BESTBULKSMS_SOURCE_URL || DEFAULT_SOURCE_URL;
  const endpoint  = process.env.BESTBULKSMS_ENDPOINT   || DEFAULT_ENDPOINT;

  const phone = normalizeNigerianPhone(to);
  if (!phone) return { ok: false, providerResponse: 'Invalid recipient phone.', to, message };

  if (!apiKey) {
    // Stub mode: no API key configured yet. Log and return a soft-success so
    // the admin UI keeps working during development without spending credits.
    console.warn('[bestbulksms] BESTBULKSMS_API_KEY not set; logging only.', { phone, message });
    return { ok: true, providerResponse: 'stub: BESTBULKSMS_API_KEY not set', to: phone, message };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        sender_id:  senderId,
        to:         [phone],
        message,
        route,
        source_url: sourceUrl,
      }),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    const providerResponse = parsed
      ? JSON.stringify({
          status: parsed.status,
          sms_message_id: parsed.sms_message_id,
          error: parsed.error || parsed.message,
          invalid_recipients: parsed.invalid_recipients,
        })
      : text || `HTTP ${res.status}`;
    const ok = res.ok && (parsed?.status ? parsed.status === 'success' : true);
    return { ok, providerResponse, to: phone, message };
  } catch (err: any) {
    return { ok: false, providerResponse: err?.message || 'SMS gateway unreachable.', to: phone, message };
  }
}
