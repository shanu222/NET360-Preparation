/**
 * Minimal PayFast (Pakistan) REST client: OAuth-style token + form POSTs.
 * Env: PAYFAST_BASE_URL, PAYFAST_MERCHANT_ID, PAYFAST_SECURED_KEY
 */
const TOKEN_CACHE_MS_SKEW = 90_000;

let tokenCache = { token: null, refreshToken: null, expAt: 0 };

function baseUrl() {
  return String(process.env.PAYFAST_BASE_URL || 'https://ipg1.payfastpakistan.com:8443').replace(/\/$/, '');
}

export function payfastConfigured() {
  return Boolean(
    String(process.env.PAYFAST_MERCHANT_ID || '').trim()
      && String(process.env.PAYFAST_SECURED_KEY || '').trim(),
  );
}

async function postForm(path, bodyFields, bearer) {
  const u = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const body = new URLSearchParams();
  Object.entries(bodyFields || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    body.set(k, String(v));
  });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(u, { method: 'POST', headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

export async function payfastGetBearer(customerIp) {
  if (!payfastConfigured()) {
    throw new Error('payfast_not_configured');
  }
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.expAt - TOKEN_CACHE_MS_SKEW) {
    return tokenCache.token;
  }

  const merchantId = String(process.env.PAYFAST_MERCHANT_ID || '').trim();
  const securedKey = String(process.env.PAYFAST_SECURED_KEY || '').trim();

  const { ok, json } = await postForm('/token', {
    merchant_id: merchantId,
    secured_key: securedKey,
    grant_type: 'client_credentials',
    customer_ip: String(customerIp || '127.0.0.1').slice(0, 45),
  });

  if (!ok || !json?.token) {
    const msg = json?.message || json?.error || 'token_failed';
    throw new Error(String(msg));
  }

  const expirySec = Number(json.expiry || 3600);
  tokenCache = {
    token: json.token,
    refreshToken: json.refresh_token || null,
    expAt: now + Math.max(120, expirySec) * 1000,
  };
  return tokenCache.token;
}

/**
 * Wallet / account transaction (first hit may trigger OTP; repeat with otp param).
 * @param {string} bearer
 * @param {Record<string, string|number>} fields
 */
export async function payfastPostTransaction(bearer, fields) {
  return postForm('/transaction', fields, bearer);
}

/**
 * GET /transaction/basket_id/:basketId?order_date=
 */
export async function payfastGetTransactionByBasket(bearer, basketId, orderDate) {
  const path = `/transaction/basket_id/${encodeURIComponent(basketId)}?order_date=${encodeURIComponent(orderDate)}`;
  const u = `${baseUrl()}${path}`;
  const res = await fetch(u, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${bearer}`,
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

export function isPayfastSuccessPayload(json) {
  if (!json || typeof json !== 'object') return false;
  const code = json.status_code ?? json.code;
  if (code === undefined || code === null || code === '') return false;
  const s = String(code);
  if (s === '00' || s === '0' || s === '79') return true;
  const n = Number(code);
  return !Number.isNaN(n) && n >= 200 && n < 300;
}
