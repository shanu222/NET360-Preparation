import express from 'express';

const CONFIG_KEY = 'WEB_SUBSCRIPTION_PLANS';
const MAX_PRICE = 1_000_000;

const STANDARD_PLAN = { title: 'text', description: 'longText', price: 'price', duration: 'text' };

const SCHEMA = {
  pageTitle: 'text',
  pageSubtitle: 'longText',
  sectionTitle: 'text',
  sectionSubtitle: 'longText',
  tests: STANDARD_PLAN,
  preparation: STANDARD_PLAN,
  community: STANDARD_PLAN,
  videos: {
    title: 'text',
    description: 'longText',
    badge: 'text',
    duration: 'text',
    regularPrice: 'price',
    offerPrice: 'price',
    offerEndsOn: 'date',
    offerLabel: 'text',
    promoText: 'longText',
    promoDetails: 'longText',
  },
  mentor: {
    title: 'text',
    description: 'longText',
    statusLabel: 'text',
    available: 'boolean',
    price: 'price',
    duration: 'text',
  },
};

class ValidationError extends Error {}

function sanitizeField(type, value, path) {
  if (type === 'boolean') return Boolean(value);
  if (type === 'price') {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0 || num > MAX_PRICE) {
      throw new ValidationError(`${path} must be a price between 0 and ${MAX_PRICE.toLocaleString('en-US')}.`);
    }
    return Math.round(num);
  }
  const text = String(value ?? '').trim();
  if (type === 'date') {
    if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${path} must be a date (YYYY-MM-DD).`);
    return text;
  }
  const max = type === 'longText' ? 600 : 80;
  if (text.length > max) throw new ValidationError(`${path} must be ${max} characters or fewer.`);
  if (type === 'text' && path.endsWith('title') && !text) throw new ValidationError(`${path} is required.`);
  return text;
}

function sanitize(schema, input, prefix = '') {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [key, type] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof type === 'object') {
      out[key] = sanitize(type, source[key], path);
    } else if (source[key] !== undefined) {
      out[key] = sanitizeField(type, source[key], path);
    }
  }
  return out;
}

function parseStored(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Admin-editable web subscription page content (titles, prices, durations, promo text).
 * Stored as one non-secret RuntimeConfig entry; clients fill missing fields with built-in defaults.
 */
export function createSubscriptionPlansRouter({
  authMiddleware,
  requireAdmin,
  readConfigValue,
  writeConfigValue,
  deleteConfigValue,
}) {
  const router = express.Router();

  const readRecord = async () => parseStored(await readConfigValue(CONFIG_KEY).catch(() => ''));

  router.get('/public/subscription-plans', async (_req, res) => {
    const record = await readRecord();
    res.set('Cache-Control', 'no-store');
    res.json({ plans: record?.plans || null });
  });

  router.get('/admin/subscription-plans', authMiddleware, requireAdmin, async (_req, res) => {
    const record = await readRecord();
    res.json({
      plans: record?.plans || null,
      updatedAt: record?.updatedAt || null,
      updatedByEmail: record?.updatedByEmail || '',
    });
  });

  router.put('/admin/subscription-plans', authMiddleware, requireAdmin, async (req, res) => {
    let plans;
    try {
      plans = sanitize(SCHEMA, req.body?.plans);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    const record = {
      plans,
      updatedAt: new Date().toISOString(),
      updatedByEmail: String(req.user?.email || ''),
    };
    try {
      await writeConfigValue(CONFIG_KEY, JSON.stringify(record), {
        description: 'Web subscription page content',
        updatedByEmail: record.updatedByEmail,
      });
      res.json({ ok: true, ...record });
    } catch (error) {
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Could not save subscription settings.' });
    }
  });

  router.delete('/admin/subscription-plans', authMiddleware, requireAdmin, async (_req, res) => {
    try {
      await deleteConfigValue(CONFIG_KEY);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Could not reset subscription settings.' });
    }
  });

  return router;
}
