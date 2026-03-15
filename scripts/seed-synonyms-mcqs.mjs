import 'dotenv/config';
import mongoose from 'mongoose';
import { connectMongo } from '../server/lib/mongo.js';
import { MCQModel } from '../server/models/MCQ.js';

function normalizeQuestion(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function toAnswerKey(correctAnswer, options) {
  const raw = String(correctAnswer || '').trim();
  if (!raw) return '';

  const byTextIndex = options.findIndex((item) => String(item || '').trim().toLowerCase() === raw.toLowerCase());
  if (byTextIndex >= 0) return String.fromCharCode(65 + byTextIndex);

  const direct = raw.match(/^(?:option\s*)?([A-Da-d]|\d)(?:\b|\)|\.|:)?/i);
  if (direct) {
    const token = String(direct[1] || '').toUpperCase();
    const index = /^\d$/.test(token) ? Number(token) - 1 : token.charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) return String.fromCharCode(65 + index);
  }

  return '';
}

const sourceMcqs = [
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'ABUNDANT'?",
    optionA: 'Scarce',
    optionB: 'Plentiful',
    optionC: 'Tiny',
    optionD: 'Bitter',
    correctAnswer: 'Plentiful',
    explanation: "'Abundant' means existing in large quantities, so 'Plentiful' is the closest synonym.",
    source: 'Vocabulary.com',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'CANDID'?",
    optionA: 'Frank',
    optionB: 'Hidden',
    optionC: 'Polite',
    optionD: 'Silent',
    correctAnswer: 'Frank',
    explanation: "'Candid' means truthful and straightforward; 'Frank' matches this meaning.",
    source: 'Merriam-Webster Thesaurus',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'EMERGE'?",
    optionA: 'Disappear',
    optionB: 'Appear',
    optionC: 'Refuse',
    optionD: 'Delay',
    correctAnswer: 'Appear',
    explanation: "'Emerge' means to come out or become visible, so 'Appear' is correct.",
    source: 'EntryTest.com',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'FRAGILE'?",
    optionA: 'Strong',
    optionB: 'Delicate',
    optionC: 'Heavy',
    optionD: 'Firm',
    correctAnswer: 'Delicate',
    explanation: "'Fragile' means easily broken; 'Delicate' conveys the same sense.",
    source: 'Testbook Synonyms Practice',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'HOSTILE'?",
    optionA: 'Friendly',
    optionB: 'Unfriendly',
    optionC: 'Calm',
    optionD: 'Gentle',
    correctAnswer: 'Unfriendly',
    explanation: "'Hostile' means showing opposition or dislike; 'Unfriendly' is the best synonym.",
    source: 'Prepistan NET English Notes',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'IMPARTIAL'?",
    optionA: 'Biased',
    optionB: 'Neutral',
    optionC: 'Rude',
    optionD: 'Unclear',
    correctAnswer: 'Neutral',
    explanation: "'Impartial' means fair and not favoring one side; 'Neutral' is the closest synonym.",
    source: 'Magoosh Vocabulary List',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'METICULOUS'?",
    optionA: 'Careless',
    optionB: 'Careful',
    optionC: 'Rough',
    optionD: 'Noisy',
    correctAnswer: 'Careful',
    explanation: "'Meticulous' means very careful and precise; therefore 'Careful' is correct.",
    source: 'Vocabulary.com',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'NOVEL'?",
    optionA: 'Ancient',
    optionB: 'New',
    optionC: 'Simple',
    optionD: 'Boring',
    correctAnswer: 'New',
    explanation: "'Novel' can mean new or original, so 'New' is the right synonym.",
    source: 'KIPS Entry Test Vocabulary',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'OBSOLETE'?",
    optionA: 'Modern',
    optionB: 'Outdated',
    optionC: 'Useful',
    optionD: 'Active',
    correctAnswer: 'Outdated',
    explanation: "'Obsolete' means no longer in use; 'Outdated' is the best synonym.",
    source: 'Dogar NET English Prep',
  },
  {
    subject: 'English',
    chapter: 'Vocabulary',
    section: 'Synonyms',
    difficulty: 'Medium',
    question: "What is the synonym of 'VIVID'?",
    optionA: 'Dull',
    optionB: 'Faint',
    optionC: 'Bright',
    optionD: 'Cold',
    correctAnswer: 'Bright',
    explanation: "'Vivid' means bright, clear, or lively; 'Bright' is the closest synonym.",
    source: 'TopGrade.pk Entry Test English',
  },
];

async function run() {
  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) {
    throw new Error('MONGODB_URI is missing.');
  }

  await connectMongo(mongoUri);

  const existingContext = await MCQModel.findOne({
    subject: { $regex: '^english$', $options: 'i' },
    chapter: { $regex: '^vocabulary$', $options: 'i' },
    section: { $regex: '^synonyms$', $options: 'i' },
  })
    .select('subject part chapter section topic')
    .lean();

  if (!existingContext) {
    throw new Error('Existing English -> Vocabulary -> Synonyms context not found. Seed was blocked to avoid creating a new chapter/section.');
  }

  const fixedSubject = String(existingContext.subject || 'english').toLowerCase().trim();
  const fixedPart = String(existingContext.part || 'part1').toLowerCase().trim();
  const fixedChapter = String(existingContext.chapter || 'Vocabulary').trim();
  const fixedSection = String(existingContext.section || 'Synonyms').trim();
  const fixedTopic = String(existingContext.topic || fixedSection || 'Synonyms').trim();

  const prepared = sourceMcqs.map((item, index) => {
    const options = [item.optionA, item.optionB, item.optionC, item.optionD].map((v) => String(v || '').trim());
    if (options.some((value) => !value)) {
      throw new Error(`MCQ ${index + 1}: all four options are required.`);
    }

    const answerKey = toAnswerKey(item.correctAnswer, options);
    if (!answerKey) {
      throw new Error(`MCQ ${index + 1}: correctAnswer must match one option.`);
    }

    return {
      subject: fixedSubject,
      part: fixedPart,
      chapter: fixedChapter,
      section: fixedSection,
      topic: fixedTopic,
      question: String(item.question || '').trim(),
      options,
      optionMedia: options.map((text, i) => ({ key: String.fromCharCode(65 + i), text, image: null })),
      answer: answerKey,
      tip: String(item.explanation || '').trim(),
      explanationText: String(item.explanation || '').trim(),
      difficulty: String(item.difficulty || 'Medium').trim(),
      source: String(item.source || 'Bulk Upload').trim(),
    };
  });

  const scopeFilter = {
    subject: fixedSubject,
    part: fixedPart,
    chapter: fixedChapter,
    section: fixedSection,
  };

  const existing = await MCQModel.find(scopeFilter).select('question').lean();
  const existingSet = new Set(existing.map((item) => normalizeQuestion(item.question)));

  const seen = new Set();
  const docsToInsert = [];
  const skipped = [];

  prepared.forEach((doc) => {
    const key = normalizeQuestion(doc.question);
    if (seen.has(key)) {
      skipped.push({ question: doc.question, reason: 'duplicate in seed payload' });
      return;
    }
    seen.add(key);

    if (existingSet.has(key)) {
      skipped.push({ question: doc.question, reason: 'already exists in database' });
      return;
    }

    docsToInsert.push(doc);
  });

  let inserted = [];
  if (docsToInsert.length) {
    inserted = await MCQModel.insertMany(docsToInsert, { ordered: true });
  }

  console.log(JSON.stringify({
    requested: prepared.length,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
    skipped,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors in failure path
  }
  process.exit(1);
});
