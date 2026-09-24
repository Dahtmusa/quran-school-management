// BestBulkSMS (bestbulksms.com) HTTP API adapter.
// Configured via environment variables so no credentials live in the repo:
//   BESTBULKSMS_USER     — portal username
//   BESTBULKSMS_PASSWORD — portal password
//   BESTBULKSMS_SENDER   — approved alphanumeric sender ID (e.g. "AMQM")
//   BESTBULKSMS_ENDPOINT — optional override (defaults to the plain-text endpoint)
//
// The gateway returns a short body like "OK: <messageId>" on success or
// "ERROR: <reason>" on failure. We surface that raw response for the audit log.

const DEFAULT_ENDPOINT = 'https://portal.bestbulksms.com/api/sendsms/plain';

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
  const user   = process.env.BESTBULKSMS_USER || '';
  const pass   = process.env.BESTBULKSMS_PASSWORD || '';
  const sender = process.env.BESTBULKSMS_SENDER || 'AMQM';
  const endpoint = process.env.BESTBULKSMS_ENDPOINT || DEFAULT_ENDPOINT;

  const phone = normalizeNigerianPhone(to);
  if (!phone) return { ok: false, providerResponse: 'Invalid recipient phone.', to, message };

  if (!user || !pass) {
    // Stub mode: no credentials configured yet. Log and return a soft-success
    // so the admin UI keeps working during development.
    console.warn('[bestbulksms] credentials missing; logging only.', { phone, message });
    return { ok: true, providerResponse: 'stub: BESTBULKSMS_USER/PASSWORD not set', to: phone, message };
  }

  const url = new URL(endpoint);
  url.searchParams.set('user', user);
  url.searchParams.set('password', pass);
  url.searchParams.set('sender', sender);
  url.searchParams.set('mobiles', phone);
  url.searchParams.set('message', message);

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const body = (await res.text()).trim();
    const ok = res.ok && /^ok/i.test(body);
    return { ok, providerResponse: body || `HTTP ${res.status}`, to: phone, message };
  } catch (err: any) {
    return { ok: false, providerResponse: err?.message || 'SMS gateway unreachable.', to: phone, message };
  }
}
