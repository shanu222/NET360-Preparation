import express from 'express';

const CONFIG_KEY = 'ONLINE_CLASSES_CONTENT';

const SCHEMA = {
  title: { type: 'text', max: 80, required: true },
  description: { type: 'longText', max: 800 },
  registrationMessage: { type: 'longText', max: 600 },
};

class ValidationError extends Error {}

function sanitizeContent(input) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [key, rule] of Object.entries(SCHEMA)) {
    const text = String(source[key] ?? '').trim();
    if (rule.required && !text) throw new ValidationError(`${key} is required.`);
    if (text.length > rule.max) throw new ValidationError(`${key} must be ${rule.max} characters or fewer.`);
    out[key] = text;
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
 * Shared Online Classes dashboard-card copy (RuntimeConfig).
 * Web and Android both read GET /api/public/online-classes.
 */
export function createOnlineClassesRouter({
  authMiddleware,
  requireAdmin,
  readConfigValue,
  writeConfigValue,
  deleteConfigValue,
}) {
  const router = express.Router();

  const readRecord = async () => parseStored(await readConfigValue(CONFIG_KEY).catch(() => ''));

  router.get('/public/online-classes', async (_req, res) => {
    const record = await readRecord();
    res.set('Cache-Control', 'no-store');
    res.json({ content: record?.content || null });
  });

  router.get('/admin/online-classes', authMiddleware, requireAdmin, async (_req, res) => {
    const record = await readRecord();
    res.json({
      content: record?.content || null,
      updatedAt: record?.updatedAt || null,
      updatedByEmail: record?.updatedByEmail || '',
    });
  });

  router.put('/admin/online-classes', authMiddleware, requireAdmin, async (req, res) => {
    let content;
    try {
      content = sanitizeContent(req.body?.content);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    const record = {
      content,
      updatedAt: new Date().toISOString(),
      updatedByEmail: String(req.user?.email || ''),
    };
    try {
      await writeConfigValue(CONFIG_KEY, JSON.stringify(record), {
        description: 'Online Classes dashboard card content',
        updatedByEmail: record.updatedByEmail,
      });
      res.json({ ok: true, ...record });
    } catch (error) {
      res.status(error?.statusCode || 500).json({ error: error?.message || 'Could not save Online Classes content.' });
    }
  });

  router.delete('/admin/online-classes', authMiddleware, requireAdmin, async (_req, res) => {
    try {
      await deleteConfigValue(CONFIG_KEY);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Could not reset Online Classes content.' });
    }
  });

  return router;
}
