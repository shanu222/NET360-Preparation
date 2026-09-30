import express from 'express';
import { deleteObject, headObject, presignGet, presignPut, r2Config } from '../lib/r2.js';

const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PUBLIC_URL_TTL_SEC = 60 * 60;

export const SITE_PROMO_SLOTS = {
  loginBanner: {
    configKey: 'SITE_PROMO_LOGIN_BANNER_OBJECT',
    label: 'Login page banner',
  },
  featuredAd: {
    configKey: 'SITE_PROMO_FEATURED_AD_OBJECT',
    label: 'Featured advertisement',
  },
};

function extFromMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function parseStored(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const objectKey = String(parsed?.objectKey || '').trim();
    if (!objectKey) return null;
    return {
      objectKey,
      contentType: String(parsed?.contentType || 'image/png'),
      fileSize: Number(parsed?.fileSize || 0),
      updatedAt: String(parsed?.updatedAt || ''),
      updatedByEmail: String(parsed?.updatedByEmail || ''),
    };
  } catch {
    return null;
  }
}

function resolveSlot(req, res) {
  const slot = String(req.params.slot || '').trim();
  if (!Object.prototype.hasOwnProperty.call(SITE_PROMO_SLOTS, slot)) {
    res.status(404).json({ error: 'Unknown promo image slot.' });
    return null;
  }
  return slot;
}

function r2Unavailable(res) {
  res.status(503).json({ error: 'Cloudflare R2 is not configured on the server.', code: 'R2_NOT_CONFIGURED' });
}

/**
 * Admin-managed website promo images stored in the existing Cloudflare R2 bucket.
 * The active object key per slot lives in RuntimeConfig (non-secret), so no new collection is needed.
 */
export function createSitePromoImagesRouter({
  authMiddleware,
  requireAdmin,
  readConfigValue,
  writeConfigValue,
  deleteConfigValue,
}) {
  const router = express.Router();

  const readSlot = async (slot) => parseStored(await readConfigValue(SITE_PROMO_SLOTS[slot].configKey));

  router.get('/public/site-promo-images', async (_req, res) => {
    const images = {};
    for (const slot of Object.keys(SITE_PROMO_SLOTS)) {
      let stored = null;
      try {
        stored = await readSlot(slot);
      } catch {
        stored = null;
      }
      images[slot] = stored
        ? { path: `/api/public/site-promo-images/${slot}?v=${encodeURIComponent(stored.updatedAt || stored.objectKey)}` }
        : null;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ images });
  });

  router.get('/public/site-promo-images/:slot', async (req, res) => {
    const slot = resolveSlot(req, res);
    if (!slot) return;
    if (!r2Config().configured) {
      res.status(404).end();
      return;
    }
    try {
      const stored = await readSlot(slot);
      if (!stored) {
        res.status(404).end();
        return;
      }
      const signed = await presignGet({
        key: stored.objectKey,
        expiresIn: PUBLIC_URL_TTL_SEC,
        contentType: stored.contentType,
      });
      res.set('Cache-Control', 'public, max-age=300');
      res.redirect(302, signed.url);
    } catch {
      res.status(404).end();
    }
  });

  router.get('/admin/site-promo-images', authMiddleware, requireAdmin, async (_req, res) => {
    const configured = r2Config().configured;
    const slots = [];
    for (const [slot, meta] of Object.entries(SITE_PROMO_SLOTS)) {
      const stored = await readSlot(slot).catch(() => null);
      let previewUrl = '';
      if (stored && configured) {
        previewUrl = await presignGet({
          key: stored.objectKey,
          expiresIn: 600,
          contentType: stored.contentType,
        }).then((signed) => signed.url).catch(() => '');
      }
      slots.push({
        slot,
        label: meta.label,
        active: Boolean(stored),
        previewUrl,
        contentType: stored?.contentType || '',
        fileSize: stored?.fileSize || 0,
        updatedAt: stored?.updatedAt || null,
        updatedByEmail: stored?.updatedByEmail || '',
      });
    }
    res.json({ r2Configured: configured, slots });
  });

  router.post('/admin/site-promo-images/:slot/upload-url', authMiddleware, requireAdmin, async (req, res) => {
    const slot = resolveSlot(req, res);
    if (!slot) return;
    if (!r2Config().configured) {
      r2Unavailable(res);
      return;
    }
    const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
    const fileSize = Number(req.body?.fileSize || 0);
    if (!IMAGE_MIME.has(mimeType)) {
      res.status(400).json({ error: 'Upload a PNG, JPG, or WebP image.' });
      return;
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: 'Image must be smaller than 10 MB.' });
      return;
    }
    const objectKey = `site-promo/${slot}/${Date.now()}.${extFromMime(mimeType)}`;
    try {
      const upload = await presignPut({ key: objectKey, contentType: mimeType, expiresIn: 15 * 60 });
      res.json({
        upload: {
          url: upload.url,
          headers: upload.headers,
          objectKey,
          expiresIn: upload.expiresIn,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Could not authorize the upload.' });
    }
  });

  router.post('/admin/site-promo-images/:slot/complete', authMiddleware, requireAdmin, async (req, res) => {
    const slot = resolveSlot(req, res);
    if (!slot) return;
    if (!r2Config().configured) {
      r2Unavailable(res);
      return;
    }
    const objectKey = String(req.body?.objectKey || '').trim();
    if (!objectKey.startsWith(`site-promo/${slot}/`)) {
      res.status(400).json({ error: 'Invalid upload reference.' });
      return;
    }
    try {
      const head = await headObject(objectKey);
      if (!head.exists) {
        res.status(400).json({ error: 'The uploaded image was not found in storage. Please upload again.' });
        return;
      }
      const previous = await readSlot(slot).catch(() => null);
      const record = {
        objectKey,
        contentType: head.contentType || 'image/png',
        fileSize: head.contentLength || 0,
        updatedAt: new Date().toISOString(),
        updatedByEmail: String(req.user?.email || ''),
      };
      await writeConfigValue(SITE_PROMO_SLOTS[slot].configKey, JSON.stringify(record), {
        description: `Website promo image: ${SITE_PROMO_SLOTS[slot].label}`,
        updatedByEmail: record.updatedByEmail,
      });
      if (previous?.objectKey && previous.objectKey !== objectKey) {
        await deleteObject(previous.objectKey).catch(() => undefined);
      }
      res.json({ ok: true, slot, updatedAt: record.updatedAt });
    } catch (error) {
      const status = error?.statusCode || 500;
      res.status(status).json({ error: error?.message || 'Could not save the image.' });
    }
  });

  router.delete('/admin/site-promo-images/:slot', authMiddleware, requireAdmin, async (req, res) => {
    const slot = resolveSlot(req, res);
    if (!slot) return;
    try {
      const previous = await readSlot(slot).catch(() => null);
      await deleteConfigValue(SITE_PROMO_SLOTS[slot].configKey);
      if (previous?.objectKey && r2Config().configured) {
        await deleteObject(previous.objectKey).catch(() => undefined);
      }
      res.json({ ok: true, slot });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Could not delete the image.' });
    }
  });

  return router;
}
