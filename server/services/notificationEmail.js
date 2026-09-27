/**
 * Outbound notification emails via the existing Resend account, plus inbound
 * Admin-Gmail → Support Chat parsing. Does not replace account-deletion mail.
 */
import crypto from 'node:crypto';

const INBOUND_TOKEN_PREFIX = 'sc';

export function extractEmailAddress(value) {
  if (!value || typeof value === 'object') {
    return String(value?.address || value?.email || '').trim().toLowerCase();
  }
  const raw = String(value || '').trim();
  const angled = raw.match(/<([^>]+)>/);
  return String(angled ? angled[1] : raw).trim().toLowerCase();
}

export function emailDomainFromFromHeader(fromHeader) {
  const address = extractEmailAddress(fromHeader);
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1).toLowerCase() : '';
}

export function buildSupportReplyToken(userId, secret) {
  const uid = String(userId || '').trim().toLowerCase();
  const key = String(secret || '').trim();
  if (!/^[a-f\d]{24}$/.test(uid) || !key) return '';
  const sig = crypto.createHmac('sha256', key).update(`support-chat:${uid}`).digest('hex').slice(0, 16);
  return `${INBOUND_TOKEN_PREFIX}.${uid}.${sig}`;
}

export function parseSupportReplyToken(value, secret) {
  const match = String(value || '').toLowerCase().match(/(?:^|[^a-z0-9])sc\.([a-f\d]{24})\.([a-f\d]{16})(?:[^a-f\d]|$)/);
  if (!match) return '';
  const expected = buildSupportReplyToken(match[1], secret);
  if (!expected) return '';
  const presented = `sc.${match[1]}.${match[2]}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return '';
  return match[1];
}

export function extractInboundReplyText(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n');
  if (!text.trim() && raw) text = String(raw);
  const cutPoints = [
    /\nOn .+wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nFrom:\s+.+\nSent:/i,
    /\n_{10,}/,
  ];
  for (const marker of cutPoints) {
    const index = text.search(marker);
    if (index > 12) text = text.slice(0, index);
  }
  text = text
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .replace(/Conversation-Ref:\s*sc\.[a-f0-9.]+\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, 1500);
}

export function verifyResendWebhookSignature(rawBody, headers, secret) {
  const key = String(secret || '').trim();
  const body = String(rawBody || '');
  const id = String(headers['svix-id'] || headers['webhook-id'] || '').trim();
  const timestamp = String(headers['svix-timestamp'] || headers['webhook-timestamp'] || '').trim();
  const signatureHeader = String(headers['svix-signature'] || headers['webhook-signature'] || '').trim();
  if (!key || !body || !id || !timestamp || !signatureHeader) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;
  const secretBytes = key.startsWith('whsec_') ? Buffer.from(key.slice(6), 'base64') : Buffer.from(key);
  const expected = crypto.createHmac('sha256', secretBytes).update(`${id}.${timestamp}.${body}`).digest('base64');
  const presented = signatureHeader.split(/\s+/).map((part) => part.replace(/^v1,/i, '').trim()).filter(Boolean);
  const expectedBuf = Buffer.from(expected);
  return presented.some((item) => {
    const got = Buffer.from(item);
    return got.length === expectedBuf.length && crypto.timingSafeEqual(got, expectedBuf);
  });
}

export function collectInboundTargets(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const bags = [data.to, data.cc, data.envelope?.to, payload?.to];
  const values = [];
  for (const bag of bags) {
    if (Array.isArray(bag)) values.push(...bag);
    else if (bag) values.push(bag);
  }
  return values.map((item) => (typeof item === 'string' ? item : String(item?.email || item?.address || ''))).filter(Boolean);
}

export function collectInboundFrom(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  return extractEmailAddress(data.from || payload?.from || data.envelope?.from);
}

export function collectInboundText(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  const text = String(data.text || data.text_body || '').trim();
  if (text) return text;
  const html = String(data.html || data.html_body || '').replace(/<[^>]+>/g, ' ');
  return html.replace(/\s+/g, ' ').trim();
}

export function collectInboundEmailId(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
  return String(data.email_id || data.id || payload?.email_id || '').trim();
}

export function notificationShell({ title, greeting, paragraphs, ctaLabel, ctaUrl, footer }) {
  const body = (paragraphs || []).map((p) => (
    `<tr><td style="padding:0 28px 14px;font-size:15px;line-height:1.6;color:#334155;">${p}</td></tr>`
  )).join('');
  const button = ctaUrl
    ? `<tr><td style="padding:12px 28px 20px;" align="center">
        <a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px;">${ctaLabel || 'Open NET360'}</a>
      </td></tr>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e1b4b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(30,27,75,0.12);">
        <tr><td style="padding:28px 28px 8px;font-size:20px;font-weight:700;color:#312e81;">NET360 Preparation</td></tr>
        <tr><td style="padding:8px 28px 20px;font-size:14px;color:#64748b;">${title}</td></tr>
        <tr><td style="padding:0 28px 12px;font-size:15px;line-height:1.6;color:#334155;">Hi <strong>${greeting}</strong>,</td></tr>
        ${body}
        ${button}
        <tr><td style="padding:8px 28px 24px;font-size:13px;line-height:1.5;color:#64748b;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
