import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../server/lib/mongo.js';
import { MCQModel } from '../server/models/MCQ.js';

async function run() {
  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) throw new Error('MONGODB_URI is missing.');

  await connectMongo(mongoUri);

  const fixes = [
    ["What is the synonym of 'EMERGE'?", 'B'],
    ["What is the synonym of 'FRAGILE'?", 'B'],
    ["What is the synonym of 'METICULOUS'?", 'B'],
    ["What is the synonym of 'VIVID'?", 'C'],
  ];

  let modified = 0;
  for (const [question, answer] of fixes) {
    const result = await MCQModel.updateMany(
      {
        subject: 'english',
        chapter: 'Vocabulary',
        section: 'Synonyms',
        question,
      },
      { $set: { answer } },
    );
    modified += Number(result.modifiedCount || 0);
  }

  console.log(JSON.stringify({ fixedQuestions: fixes.length, modified }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
