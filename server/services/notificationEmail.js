/**
 * Outbound notification emails via the existing Resend account.
 * Does not replace account-deletion mail. No inbound / Gmail-reply handling.
 */
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
