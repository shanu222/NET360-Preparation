import 'dotenv/config';
import { connectMongo } from '../server/lib/mongo.js';
import { MCQModel } from '../server/models/MCQ.js';

const PART_1_REGEX = /^(?:part[\s_-]*)?1$/i;
const PART_2_REGEX = /^(?:part[\s_-]*)?2$/i;

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';
}

async function run() {
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    throw new Error('Missing DB URI. Set MONGODB_URI, DATABASE_URL, or MONGO_URI.');
  }

  await connectMongo(mongoUri);

  const before = {
    part1Candidates: await MCQModel.countDocuments({
      $or: [
        { part: PART_1_REGEX },
        { part_id: PART_1_REGEX },
      ],
    }),
    part2Candidates: await MCQModel.countDocuments({
      $or: [
        { part: PART_2_REGEX },
        { part_id: PART_2_REGEX },
      ],
    }),
  };

  const [part1Main, part2Main, part1Legacy, part2Legacy] = await Promise.all([
    MCQModel.collection.updateMany(
      {
        $or: [
          { part: PART_1_REGEX },
          { part_id: PART_1_REGEX },
        ],
      },
      { $set: { part: 'part1' } },
    ),
    MCQModel.collection.updateMany(
      {
        $or: [
          { part: PART_2_REGEX },
          { part_id: PART_2_REGEX },
        ],
      },
      { $set: { part: 'part2' } },
    ),
    MCQModel.collection.updateMany(
      { part_id: PART_1_REGEX },
      { $set: { part_id: 'part1' } },
    ),
    MCQModel.collection.updateMany(
      { part_id: PART_2_REGEX },
      { $set: { part_id: 'part2' } },
    ),
  ]);

  const after = {
    part1Canonical: await MCQModel.countDocuments({
      $or: [
        { part: 'part1' },
        { part_id: 'part1' },
      ],
    }),
    part2Canonical: await MCQModel.countDocuments({
      $or: [
        { part: 'part2' },
        { part_id: 'part2' },
      ],
    }),
  };

  console.log(JSON.stringify({
    ok: true,
    description: 'One-time MCQ part normalization to canonical part1/part2 values.',
    before,
    updates: {
      partField: {
        part1: {
          matched: part1Main.matchedCount || 0,
          modified: part1Main.modifiedCount || 0,
        },
        part2: {
          matched: part2Main.matchedCount || 0,
          modified: part2Main.modifiedCount || 0,
        },
      },
      partIdField: {
        part1: {
          matched: part1Legacy.matchedCount || 0,
          modified: part1Legacy.modifiedCount || 0,
        },
        part2: {
          matched: part2Legacy.matchedCount || 0,
          modified: part2Legacy.modifiedCount || 0,
        },
      },
    },
    after,
  }, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to normalize MCQ part values.');
  process.exit(1);
});
