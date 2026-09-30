import express from 'express';

const CONFIG_KEY = 'ONLINE_CLASSES_CONTENT';

const SCHEMA = {
  cardBadge: { type: 'text', max: 48 },
  cardTitle: { type: 'text', max: 80, required: true },
  cardDescription: { type: 'longText', max: 400 },
  pageTitle: { type: 'text', max: 80, required: true },
  description: { type: 'longText', max: 800 },
  registrationMessage: { type: 'longText', max: 600 },
  classDetails: { type: 'longText', max: 2000 },
  ctaText: { type: 'text', max: 48, required: true },
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

function registrationPayload(user) {
  const record = user?.onlineClassesRegistration || {};
  const registeredAt = record.registeredAt ? new Date(record.registeredAt).toISOString() : null;
  return {
    registered: Boolean(registeredAt),
    registeredAt,
    fullName: String(record.fullName || '').trim(),
    phone: String(record.phone || '').trim(),
    city: String(record.city || '').trim(),
    targetProgram: String(record.targetProgram || '').trim(),
    note: String(record.note || '').trim(),
  };
}

function sanitizeRegistration(body, user) {
  const fullName = String(body?.fullName || `${user?.firstName || ''} ${user?.lastName || ''}`).trim().slice(0, 80);
  const phone = String(body?.phone || '').replace(/[^\d+\s-]/g, '').trim().slice(0, 24);
  const city = String(body?.city || '').trim().slice(0, 60);
  const targetProgram = String(body?.targetProgram || '').trim().slice(0, 80);
  const note = String(body?.note || '').trim().slice(0, 400);
  const platform = String(body?.platform || '').trim().toLowerCase() === 'android' ? 'android' : 'web';
  if (!fullName) throw new ValidationError('Name is required.');
  if (phone.replace(/\D/g, '').length < 10) throw new ValidationError('Enter a valid phone number.');
  return { fullName, phone, city, targetProgram, note, platform };
}

/**
 * Shared Online Classes content (RuntimeConfig) and student registrations (User document).
 * Web and Android both read the same public content and write the same registration fields.
 */
export function createOnlineClassesRouter({
  UserModel,
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

  router.get('/online-classes/me', authMiddleware, async (req, res) => {
    const user = await UserModel.findById(req.user._id).select('firstName lastName onlineClassesRegistration').lean();
    res.json(registrationPayload(user));
  });

  router.post('/online-classes/register', authMiddleware, async (req, res) => {
    if (req.user?.role === 'admin') {
      res.status(403).json({ error: 'Use a student account to register for online classes.' });
      return;
    }
    let fields;
    try {
      fields = sanitizeRegistration(req.body, req.user);
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
    const now = new Date();
    const updated = await UserModel.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          onlineClassesRegistration: {
            ...fields,
            registeredAt: now,
          },
        },
      },
      { new: true, select: 'onlineClassesRegistration firstName lastName' },
    ).lean();
    res.json({ ok: true, ...registrationPayload(updated) });
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
        description: 'Online Classes page and dashboard card content',
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

  router.get('/admin/online-classes/registrations', authMiddleware, requireAdmin, async (_req, res) => {
    const users = await UserModel.find({ 'onlineClassesRegistration.registeredAt': { $ne: null } })
      .select('firstName lastName email onlineClassesRegistration')
      .sort({ 'onlineClassesRegistration.registeredAt': -1 })
      .limit(300)
      .lean();
    res.json({
      registrations: users.map((user) => ({
        id: String(user._id),
        email: String(user.email || ''),
        accountName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        ...registrationPayload(user),
        platform: String(user.onlineClassesRegistration?.platform || ''),
      })),
    });
  });

  return router;
}
