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

/**
 * Every NET360 email tries Resend first. Brevo is used only when Resend is not
 * configured or Resend reports that its sending limit has been exceeded.
 */
export async function sendTransactionalEmail(message, deps = {}) {
  const sendResend = deps.sendResend || sendResendEmail;
  const sendBrevo = deps.sendBrevo || sendBrevoEmail;
  const resendReady = deps.resendReady !== undefined
    ? Boolean(deps.resendReady)
    : Boolean(String(process.env.RESEND_API_KEY || '').trim());
  if (resendReady) {
    try {
      return await sendResend(message);
    } catch (error) {
      if (!isProviderLimitError(error)) throw error;
    }
  }
  return sendBrevo(message);
}
