function redactSecrets(message) {
  return String(message || '')
    .replace(/xkeysib-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/re_[A-Za-z0-9_]+/g, '[redacted]')
    .slice(0, 220);
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    let detail = raw.slice(0, 180);
    try {
      const parsed = JSON.parse(raw);
      detail = String(parsed?.message || parsed?.code || parsed?.name || detail);
    } catch {
      /* keep snippet */
    }
    const error = new Error(redactSecrets(`${response.status}: ${detail}`));
    error.status = response.status;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function sendBrevoEmail({ to, subject, text, html }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  const fromEmail = String(process.env.BREVO_FROM_EMAIL || '').trim();
  const fromName = String(process.env.BREVO_FROM_NAME || 'NET360 Preparation').trim() || 'NET360 Preparation';
  if (!apiKey || !fromEmail) {
    const error = new Error('Brevo is not configured');
    error.status = 503;
    throw error;
  }
  const payload = await postJson('https://api.brevo.com/v3/smtp/email', {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    accept: 'application/json',
  }, {
    sender: { email: fromEmail, name: fromName },
    to: [{ email: to }],
    subject,
    textContent: text || '',
    htmlContent: html || text || '',
  });
  return { provider: 'brevo', messageId: String(payload?.messageId || '') };
}

async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Resend is not configured');
    error.status = 503;
    throw error;
  }
  const from = String(process.env.RESEND_FROM_EMAIL || '').trim() || 'NET360 <beth.t@example.com>';
  const payload = await postJson('https://api.resend.com/emails', {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }, {
    from,
    to: [to],
    subject,
    text,
    html,
  });
  return { provider: 'resend', messageId: String(payload?.id || '') };
}

export function isProviderLimitError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  return status === 429 || /quota|rate limit|rate_limit|too many requests|daily sending limit|daily_quota|limit exceeded/.test(message);
}

export function isPermanentRecipientError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  const recipientProblem = /invalid `to`|invalid to field|invalid email address|recipient address|email address is not valid|does not comply with addr-spec|invalid recipient/;
  const senderProblem = /domain|from address|sender|not verified/;
  if (senderProblem.test(message) && !recipientProblem.test(message)) return false;
  return recipientProblem.test(message) || ((status === 400 || status === 422) && recipientProblem.test(message));
}

let resendFromCache = { at: 0, froms: [] };

export function resetResendFromCache() {
  resendFromCache = { at: 0, froms: [] };
}

async function resendFromCandidates(apiKey, deps = {}) {
  const now = Date.now();
  if (!deps.listDomains && resendFromCache.froms.length && now - resendFromCache.at < 5 * 60 * 1000) {
    return resendFromCache.froms;
  }
  const seen = new Set();
  const froms = [];
  const add = (value) => {
    const from = String(value || '').trim();
    const key = from.toLowerCase();
    if (!from || seen.has(key)) return;
    seen.add(key);
    froms.push(from);
  };
  const listDomains = deps.listDomains || (async () => {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return [];
    const parsed = await response.json().catch(() => ({}));
    return Array.isArray(parsed?.data) ? parsed.data : [];
  });
  try {
    const rows = await listDomains();
    for (const row of rows || []) {
      const name = String(row?.name || '').trim().toLowerCase();
      const status = String(row?.status || '').trim().toLowerCase();
      if (name && status.includes('verified')) add(`NET360 Preparation <noreply@${name}>`);
    }
  } catch {
    /* A domain lookup failure still leaves the configured from-address. */
  }
  add(process.env.RESEND_FROM_EMAIL);
  add('NET360 Preparation <noreply@net360preparation.com>');
  resendFromCache = { at: now, froms };
  return froms;
}

async function sendResendWithCandidates(message, deps = {}) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey && !deps.sendOnce) {
    const error = new Error('Resend is not configured');
    error.status = 503;
    throw error;
  }
  const froms = deps.froms || await resendFromCandidates(apiKey, deps);
  if (!froms.length) {
    const error = new Error('Resend from-address is not configured');
    error.status = 503;
    throw error;
  }
  const sendOnce = deps.sendOnce || (async (from) => {
    const payload = await postJson('https://api.resend.com/emails', {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }, {
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { provider: 'resend', messageId: String(payload?.id || '') };
  });
  let lastError = new Error('Resend did not accept the email');
  for (let index = 0; index < froms.length; index += 1) {
    try {
      return await sendOnce(froms[index], message);
    } catch (error) {
      lastError = error;
      if (isPermanentRecipientError(error) || isProviderLimitError(error) || index >= froms.length - 1) throw error;
    }
  }
  throw lastError;
}

/**
 * Every NET360 email tries Resend first, using a verified from-address.
 * Brevo is used when Resend is not configured or cannot deliver (sending limit,
 * outage, or sender rejection). An invalid recipient is not sent through Brevo.
 */
export async function sendTransactionalEmail(message, deps = {}) {
  const sendResend = deps.sendResend || ((payload) => sendResendWithCandidates(payload, deps));
  const sendBrevo = deps.sendBrevo || sendBrevoEmail;
  const resendReady = deps.resendReady !== undefined
    ? Boolean(deps.resendReady)
    : Boolean(String(process.env.RESEND_API_KEY || '').trim());
  if (resendReady) {
    try {
      return await sendResend(message);
    } catch (error) {
      if (isPermanentRecipientError(error)) throw error;
    }
  }
  return sendBrevo(message);
}
