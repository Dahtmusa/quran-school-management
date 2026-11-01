// Live diagnostic endpoint for debugging BestBulkSMS Cloudflare 403s.
// Hits their send endpoint 3 times, captures every response header
// (CF-Ray, cf-mitigated, etc), captures our Vercel outbound IP, and
// renders a self-contained HTML report the admin can screenshot and
// forward to BestBulkSMS support. Admin-only. No SMS is actually sent
// because the request body intentionally targets a non-dispatchable
// recipient; we only care about the HTTP response.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['super_admin','admin','principal','finance'];
const ENDPOINT = process.env.BESTBULKSMS_ENDPOINT || 'https://www.bestbulksms.com.ng/api/sms/send';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type Probe = {
  attempt: number;
  startedAt: string;
  durationMs: number;
  status: number | null;
  cfRay: string | null;
  cfMitigated: string | null;
  cfCacheStatus: string | null;
  server: string | null;
  date: string | null;
  contentType: string | null;
  bodySample: string;
  looksLikeChallenge: boolean;
  parsed: unknown;
  error: string | null;
};

async function probeOnce(attempt: number, apiKey: string, senderId: string): Promise<Probe> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-NG,en;q=0.9',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        sender_id: senderId,
        to: ['2340000000000'], // non-routable; we only need the HTTP response
        message: 'AMQM diagnostic probe (ignore).',
        route: 'standard',
      }),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch {}
    const looksLikeChallenge = !parsed && /just a moment|cf-chl|challenge-platform|cloudflare/i.test(text);
    return {
      attempt,
      startedAt,
      durationMs: Date.now() - started,
      status: res.status,
      cfRay: res.headers.get('cf-ray'),
      cfMitigated: res.headers.get('cf-mitigated'),
      cfCacheStatus: res.headers.get('cf-cache-status'),
      server: res.headers.get('server'),
      date: res.headers.get('date'),
      contentType: res.headers.get('content-type'),
      bodySample: text.slice(0, 500),
      looksLikeChallenge,
      parsed,
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      attempt,
      startedAt,
      durationMs: Date.now() - started,
      status: null, cfRay: null, cfMitigated: null, cfCacheStatus: null,
      server: null, date: null, contentType: null,
      bodySample: '', looksLikeChallenge: false, parsed: null,
      error: message,
    };
  }
}

async function getOutboundIp(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { headers: { 'User-Agent': UA } });
    const j = await r.json();
    return String((j as { ip?: string }).ip || 'unknown');
  } catch {
    return 'unknown (ipify unreachable)';
  }
}

function esc(s: string | null | undefined): string {
  return String(s ?? '—').replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  ));
}

function renderHtml(opts: { outboundIp: string; senderId: string; apiKeyTail: string; probes: Probe[]; account: string | null }): string {
  const { outboundIp, senderId, apiKeyTail, probes, account } = opts;
  const anyBlocked = probes.some(p => p.looksLikeChallenge || p.status === 403);
  const banner = anyBlocked
    ? '<span class="badge bad">BLOCKED by Cloudflare</span>'
    : '<span class="badge ok">Gateway reachable</span>';

  const rows = probes.map(p => `
    <tr>
      <td class="k">Attempt ${p.attempt}</td>
      <td class="v">
        <div><strong>${p.status === null ? '(network error)' : 'HTTP ' + p.status}</strong>
        ${p.looksLikeChallenge ? '<span class="pill bad">Cloudflare challenge HTML</span>' : (p.parsed ? '<span class="pill ok">JSON</span>' : '')}
        </div>
        <div class="small">${esc(p.startedAt)} · ${p.durationMs} ms</div>
        <table class="inner">
          <tr><td class="ik">cf-ray</td><td class="iv">${esc(p.cfRay)}</td></tr>
          <tr><td class="ik">cf-mitigated</td><td class="iv">${esc(p.cfMitigated)}</td></tr>
          <tr><td class="ik">cf-cache-status</td><td class="iv">${esc(p.cfCacheStatus)}</td></tr>
          <tr><td class="ik">server</td><td class="iv">${esc(p.server)}</td></tr>
          <tr><td class="ik">date</td><td class="iv">${esc(p.date)}</td></tr>
          <tr><td class="ik">content-type</td><td class="iv">${esc(p.contentType)}</td></tr>
          ${p.error ? `<tr><td class="ik">fetch error</td><td class="iv">${esc(p.error)}</td></tr>` : ''}
        </table>
        <details><summary>Response body sample (first 500 bytes)</summary><pre>${esc(p.bodySample || '(empty)')}</pre></details>
      </td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>BestBulkSMS 403 — Live Diagnostic Report</title>
<style>
  :root{color-scheme:light}*{box-sizing:border-box}
  body{margin:0;padding:28px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f7f7f8;color:#111;line-height:1.5}
  .card{max-width:960px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;box-shadow:0 6px 24px rgba(0,0,0,.04)}
  h1{margin:0 0 4px;font-size:22px}
  .sub{color:#6b7280;font-size:13px;margin-bottom:18px}
  h2{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#374151;margin:22px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  td.k{color:#6b7280;width:30%;padding:7px 10px 7px 0;vertical-align:top;white-space:nowrap}
  td.v{color:#111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all;padding:7px 0;vertical-align:top}
  table.inner{margin-top:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
  table.inner td{padding:4px 10px;font-size:12.5px}
  td.ik{color:#6b7280;width:30%;white-space:nowrap}
  td.iv{color:#111;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
  details{margin-top:8px}summary{cursor:pointer;color:#2563eb;font-size:12.5px}
  pre{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;color:#991b1b;font-size:11.5px;overflow-x:auto;white-space:pre-wrap;max-height:220px}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:800;vertical-align:middle;margin-left:6px}
  .badge.bad{background:#fee2e2;color:#991b1b}
  .badge.ok{background:#dcfce7;color:#166534}
  .pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;margin-left:6px}
  .pill.bad{background:#fee2e2;color:#991b1b}
  .pill.ok{background:#dcfce7;color:#166534}
  .ask{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;color:#78350f;font-size:14px;margin-top:10px}
  .small{color:#6b7280;font-size:12px;margin-top:2px}
</style></head><body>
<div class="card">
  <h1>BestBulkSMS API — Live Cloudflare Diagnostic ${banner}</h1>
  <div class="sub">Generated now, directly from the AMQM production server. All Ray IDs below are fresh — your Cloudflare dashboard can look them up and show which rule fired.</div>

  <h2>Our side</h2>
  <table>
    <tr><td class="k">BestBulkSMS account</td><td class="v">${esc(account)}</td></tr>
    <tr><td class="k">Sender ID in use</td><td class="v">${esc(senderId)}</td></tr>
    <tr><td class="k">API key (last 4 chars)</td><td class="v">${esc(apiKeyTail)}</td></tr>
    <tr><td class="k">Server outbound IP (seen by you)</td><td class="v"><strong>${esc(outboundIp)}</strong></td></tr>
    <tr><td class="k">Hosting</td><td class="v">Vercel serverless Node.js (region: iad1)</td></tr>
    <tr><td class="k">Portal URL</td><td class="v">https://aliyumaimuna.com.ng</td></tr>
  </table>

  <h2>Request we send</h2>
  <table>
    <tr><td class="k">Method / URL</td><td class="v">POST ${esc(ENDPOINT)}</td></tr>
    <tr><td class="k">Authorization</td><td class="v">Bearer &lt;API_KEY ending ${esc(apiKeyTail)}&gt;</td></tr>
    <tr><td class="k">User-Agent</td><td class="v">${esc(UA)}</td></tr>
    <tr><td class="k">Body</td><td class="v">{ "sender_id": "${esc(senderId)}", "to": ["2340000000000"], "message": "AMQM diagnostic probe", "route": "standard" }</td></tr>
  </table>

  <h2>Live probes (3 attempts, back-to-back)</h2>
  <table>${rows}</table>

  <h2>What we need from you</h2>
  <div class="ask">
    One of the following, please:<br/>
    <strong>(a)</strong> Allow-list the outbound IP above (<code>${esc(outboundIp)}</code>) on your Cloudflare for <code>/api/sms/send</code>, or<br/>
    <strong>(b)</strong> Disable the Managed Challenge / Bot Fight Mode rule on that path, or<br/>
    <strong>(c)</strong> Give us a direct API hostname (e.g. <code>api.bestbulksms.com.ng</code>) that is not behind the challenge.<br/><br/>
    Reference the <strong>cf-ray</strong> values above in your Cloudflare "Security Events" view to see the exact rule that blocked each request.
  </div>

  <div class="small" style="margin-top:18px">Contact: admin@aliyumaimuna.com.ng · Reporter: Elian Enyiraneza</div>
</div></body></html>`;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role,email').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) return new NextResponse('Admin only', { status: 403 });

  const apiKey = process.env.BESTBULKSMS_API_KEY || '';
  const senderId = process.env.BESTBULKSMS_SENDER || 'AMQM';
  const apiKeyTail = apiKey ? apiKey.slice(-4) : '(none)';

  const outboundIp = await getOutboundIp();
  const probes: Probe[] = [];
  for (let i = 1; i <= 3; i++) {
    probes.push(await probeOnce(i, apiKey, senderId));
    if (i < 3) await new Promise(r => setTimeout(r, 500));
  }

  const html = renderHtml({ outboundIp, senderId, apiKeyTail, probes, account: 'AMQM (Aliyu and Maimuna Center for Quranic Memorization)' });
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
