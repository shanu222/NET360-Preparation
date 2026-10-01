import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ClosingMeritMetaModel, ClosingMeritModel } from '../models/ClosingMerit.js';
import { CLOSING_MERIT_CATEGORY_ORDER, closingMeritSeedDocuments } from '../lib/closingMeritCatalog.js';

const documentRows = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/nust2026ClosingMerits.json'), 'utf8'));

const CATEGORY_LABELS = {
  engineering: 'Engineering Programs',
  computing: 'Computing Programs',
  business: 'Business, Social Sciences & Law',
  architecture: 'Architecture & Design',
  sciences: 'Natural & Interdisciplinary Sciences',
  applied: 'Applied Sciences',
};

const meritField = z.union([z.number().min(0).max(100), z.null()]);
const positionField = z.union([z.number().min(1).max(200000), z.null()]);
const statusField = z.enum(['real', 'estimated']);

const categoryKeyField = z.string().trim().refine((value) => CLOSING_MERIT_CATEGORY_ORDER.includes(value), {
  message: 'Choose a program category.',
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  institution: z.string().trim().min(1).max(80),
  location: z.string().trim().max(120).optional().default(''),
  categoryKey: categoryKeyField,
  closingMerit: meritField,
  meritPosition: positionField.optional().default(null),
  meritStatus: statusField.optional().default('estimated'),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  institution: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(120).optional(),
  categoryKey: categoryKeyField.optional(),
  closingMerit: meritField.optional(),
  meritPosition: positionField.optional(),
  meritStatus: statusField.optional(),
});

function toPublic(doc) {
  return {
    id: String(doc._id),
    name: String(doc.name || ''),
    institution: String(doc.institution || ''),
    location: String(doc.location || ''),
    categoryKey: String(doc.categoryKey || ''),
    categoryLabel: String(doc.categoryLabel || CATEGORY_LABELS[doc.categoryKey] || 'Programs'),
    closingMerit: doc.closingMerit == null || !Number.isFinite(Number(doc.closingMerit))
      ? null
      : Number(doc.closingMerit),
    meritPosition: doc.meritPosition == null || !Number.isFinite(Number(doc.meritPosition))
      ? null
      : Math.round(Number(doc.meritPosition)),
    meritStatus: doc.meritStatus === 'real' ? 'real' : 'estimated',
  };
}

function schoolCode(institution) {
  return String(institution || '').split(/[·/|,]/)[0].trim().toUpperCase();
}

function rowKey(name, institution) {
  return `${String(name || '').trim().toLowerCase()}|${schoolCode(institution)}`;
}

const DOCUMENT_BY_KEY = new Map(documentRows.map((row) => [rowKey(row[0], row[1]), {
  meritPosition: Number(row[2]),
  closingMerit: Number(row[3]),
  meritStatus: row[4] === 'real' ? 'real' : 'estimated',
}]));

async function readYear() {
  const meta = await ClosingMeritMetaModel.findOne({ key: 'default' }).lean();
  const year = Number(meta?.year);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : 2026;
}

async function applyDocumentOnce() {
  const meta = await ClosingMeritMetaModel.findOne({ key: 'default' }).lean();
  if (meta?.documentApplied) return;

  const docs = await ClosingMeritModel.find({});
  for (const doc of docs) {
    const hit = DOCUMENT_BY_KEY.get(rowKey(doc.name, doc.institution));
    if (!hit) continue;
    doc.closingMerit = hit.closingMerit;
    doc.meritPosition = hit.meritPosition;
    doc.meritStatus = hit.meritStatus;
    await doc.save();
  }

  await ClosingMeritMetaModel.updateOne(
    { key: 'default' },
    { $set: { documentApplied: true, year: Number(meta?.year) || 2026 } },
    { upsert: true },
  );
}

async function ensureSeeded() {
  const existing = await ClosingMeritModel.find({}, { name: 1, institution: 1, location: 1 }).lean();
  const seen = new Set(existing.map((doc) => `${doc.name}|${doc.institution}|${doc.location}`.trim().toLowerCase()));
  const missing = closingMeritSeedDocuments().filter((doc) => !seen.has(`${doc.name}|${doc.institution}|${doc.location}`.trim().toLowerCase()));
  if (!missing.length) return;

  try {
    await ClosingMeritModel.insertMany(missing, { ordered: false });
  } catch (error) {
    const writeErrors = Array.isArray(error?.writeErrors) ? error.writeErrors : [];
    const onlyDuplicates = error?.code === 11000 || (writeErrors.length > 0 && writeErrors.every((item) => item?.code === 11000));
    if (!onlyDuplicates) throw error;
  }
}

async function listPrograms() {
  await ensureSeeded();
  await applyDocumentOnce();
  const docs = await ClosingMeritModel.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const rank = new Map(CLOSING_MERIT_CATEGORY_ORDER.map((key, index) => [key, index]));
  docs.sort((a, b) => {
    const categoryDelta = (rank.get(a.categoryKey) ?? 99) - (rank.get(b.categoryKey) ?? 99);
    if (categoryDelta !== 0) return categoryDelta;
    return String(a.name).localeCompare(String(b.name)) || String(a.institution).localeCompare(String(b.institution));
  });
  return { year: await readYear(), programs: docs.map(toPublic) };
}

export function registerClosingMeritRoutes(app, { authMiddleware, requireAdmin }) {
  app.get('/api/public/closing-merits', async (_req, res) => {
    try {
      const listed = await listPrograms();
      res.json({ source: 'admin', year: listed.year, programs: listed.programs });
    } catch (error) {
      console.error('[closing-merits] public list failed:', error);
      res.status(500).json({ error: 'Could not load closing merits.' });
    }
  });

  app.get('/api/admin/closing-merits', authMiddleware, requireAdmin, async (_req, res) => {
    try {
      const listed = await listPrograms();
      res.json({ year: listed.year, programs: listed.programs });
    } catch (error) {
      console.error('[closing-merits] admin list failed:', error);
      res.status(500).json({ error: 'Could not load closing merits.' });
    }
  });

  app.post('/api/admin/closing-merits', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Enter a program name, school, and a closing merit from 0 to 100.' });
        return;
      }

      await ensureSeeded();
      const last = await ClosingMeritModel.findOne({}).sort({ sortOrder: -1 }).lean();
      const created = await ClosingMeritModel.create({
        ...parsed.data,
        categoryLabel: CATEGORY_LABELS[parsed.data.categoryKey],
        sortOrder: Number(last?.sortOrder || 0) + 1,
      });
      res.status(201).json({ program: toPublic(created) });
    } catch (error) {
      if (error?.code === 11000) {
        res.status(409).json({ error: 'That program is already on the list.' });
        return;
      }
      console.error('[closing-merits] create failed:', error);
      res.status(500).json({ error: 'Could not add that program.' });
    }
  });

  app.put('/api/admin/closing-merits/settings', authMiddleware, requireAdmin, async (req, res) => {
    try {
      const year = Number(req.body?.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        res.status(400).json({ error: 'Enter a year from 2000 to 2100.' });
        return;
      }
      await ClosingMeritMetaModel.updateOne({ key: 'default' }, { $set: { year } }, { upsert: true });
      res.json({ year });
    } catch (error) {
      console.error('[closing-merits] year update failed:', error);
      res.status(500).json({ error: 'Could not save the closing-merit year.' });
    }
  });

  app.put('/api/admin/closing-merits/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400).json({ error: 'Unknown program.' });
        return;
      }

      const parsed = updateSchema.safeParse(req.body || {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Check the program name and closing merit (0 to 100).' });
        return;
      }

      const update = { ...parsed.data };
      if (update.categoryKey) update.categoryLabel = CATEGORY_LABELS[update.categoryKey];

      const saved = await ClosingMeritModel.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
      if (!saved) {
        res.status(404).json({ error: 'Program not found.' });
        return;
      }

      res.json({ program: toPublic(saved) });
    } catch (error) {
      console.error('[closing-merits] update failed:', error);
      res.status(500).json({ error: 'Could not save that closing merit.' });
    }
  });

  app.delete('/api/admin/closing-merits/:id', authMiddleware, requireAdmin, async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        res.status(400).json({ error: 'Unknown program.' });
        return;
      }

      const removed = await ClosingMeritModel.findByIdAndDelete(req.params.id).lean();
      if (!removed) {
        res.status(404).json({ error: 'Program not found.' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[closing-merits] delete failed:', error);
      res.status(500).json({ error: 'Could not remove that program.' });
    }
  });
}
