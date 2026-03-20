import 'dotenv/config';
import mongoose from 'mongoose';
import { MCQModel } from '../server/models/MCQ.js';
import { buildMcqContentFingerprint, resolveUniqueMcqExternalId } from '../server/lib/mcqIdentity.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';

function isMissingIdentity(row) {
  const externalId = String(row?.externalId || '').trim();
  const contentFingerprint = String(row?.contentFingerprint || '').trim();
  return !externalId || !contentFingerprint;
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error('Missing MongoDB connection string. Set MONGODB_URI (or DATABASE_URL / MONGO_URI).');
  }

  await mongoose.connect(MONGODB_URI, {
    minPoolSize: 1,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 20_000,
    socketTimeoutMS: 60_000,
    autoIndex: false,
  });

  const totalCount = await MCQModel.countDocuments();
  const missingOnly = process.argv.includes('--missing-only');
  console.log(`[mcq-id-backfill] Total MCQs: ${totalCount}`);
  console.log(`[mcq-id-backfill] Mode: ${missingOnly ? 'missing-only' : 'full'}`);

  const usedExternalIds = missingOnly
    ? new Set(
      (await MCQModel.distinct('externalId', { externalId: { $exists: true, $ne: '' } }))
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )
    : new Set();

  const cursor = MCQModel.find({}, {
    _id: 1,
    externalId: 1,
    contentFingerprint: 1,
    subject: 1,
    part: 1,
    chapter: 1,
    section: 1,
    topic: 1,
    question: 1,
    options: 1,
    optionMedia: 1,
  }).sort({ _id: 1 }).cursor();

  let scanned = 0;
  let updated = 0;
  const bulkOps = [];

  for await (const row of cursor) {
    scanned += 1;
    if (missingOnly && !isMissingIdentity(row)) {
      continue;
    }

    const optionTexts = Array.isArray(row.optionMedia) && row.optionMedia.length
      ? row.optionMedia.map((item) => String(item?.text || ''))
      : (Array.isArray(row.options) ? row.options : []);

    const identitySource = {
      subject: String(row.subject || '').trim().toLowerCase(),
      part: String(row.part || '').trim().toLowerCase(),
      chapter: String(row.chapter || '').trim(),
      section: String(row.section || '').trim(),
      topic: String(row.topic || '').trim(),
      question: String(row.question || '').trim(),
      options: optionTexts,
    };

    const contentFingerprint = buildMcqContentFingerprint(identitySource);
    const externalId = await resolveUniqueMcqExternalId({
      model: null,
      mcq: identitySource,
      usedExternalIds,
    });

    const currentExternalId = String(row.externalId || '').trim();
    const currentFingerprint = String(row.contentFingerprint || '').trim();
    if (currentExternalId === externalId && currentFingerprint === contentFingerprint) {
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            externalId,
            contentFingerprint,
          },
        },
      },
    });

    if (bulkOps.length >= 500) {
      const result = await MCQModel.bulkWrite(bulkOps, { ordered: false });
      updated += Number(result.modifiedCount || 0);
      bulkOps.length = 0;
      console.log(`[mcq-id-backfill] Progress: scanned=${scanned}, updated=${updated}`);
    }
  }

  if (bulkOps.length) {
    const result = await MCQModel.bulkWrite(bulkOps, { ordered: false });
    updated += Number(result.modifiedCount || 0);
  }

  console.log(`[mcq-id-backfill] Completed. scanned=${scanned}, updated=${updated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[mcq-id-backfill] Failed:', error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors during script failure.
  }
  process.exit(1);
});
