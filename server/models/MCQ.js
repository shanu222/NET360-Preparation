import mongoose from 'mongoose';
import { buildMcqContentFingerprint, resolveUniqueMcqExternalId } from '../lib/mcqIdentity.js';

const mcqImageSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    dataUrl: { type: String, default: '' },
  },
  { _id: false },
);

const mcqOptionSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    text: { type: String, default: '' },
    image: { type: mcqImageSchema, default: null },
  },
  { _id: false },
);

const mcqSchema = new mongoose.Schema(
  {
    externalId: { type: String, default: undefined, index: true },
    contentFingerprint: { type: String, default: '', index: true },
    subject: { type: String, required: true, index: true },
    part: { type: String, default: '', index: true },
    chapter: { type: String, default: '', index: true },
    section: { type: String, default: '', index: true },
    topic: { type: String, required: true, index: true },
    question: { type: String, required: true },
    questionImageUrl: { type: String, default: '' },
    questionImage: { type: mcqImageSchema, default: null },
    options: { type: [String], required: true },
    optionMedia: { type: [mcqOptionSchema], default: [] },
    answer: { type: String, required: true },
    tip: { type: String, default: '' },
    explanationText: { type: String, default: '' },
    explanationImage: { type: mcqImageSchema, default: null },
    shortTrickText: { type: String, default: '' },
    shortTrickImage: { type: mcqImageSchema, default: null },
    difficulty: { type: String, required: true, index: true },
    source: { type: String, default: 'Imported' },
  },
  { timestamps: true },
);

mcqSchema.pre('validate', async function ensureMcqIdentity(next) {
  try {
    const shouldRefreshIdentity = this.isNew
      || !String(this.externalId || '').trim()
      || !String(this.contentFingerprint || '').trim()
      || this.isModified('subject')
      || this.isModified('part')
      || this.isModified('chapter')
      || this.isModified('section')
      || this.isModified('topic')
      || this.isModified('question')
      || this.isModified('options')
      || this.isModified('optionMedia');

    if (!shouldRefreshIdentity) {
      next();
      return;
    }

    const optionTexts = Array.isArray(this.optionMedia) && this.optionMedia.length
      ? this.optionMedia.map((item) => String(item?.text || ''))
      : (Array.isArray(this.options) ? this.options : []);

    const identitySource = {
      subject: String(this.subject || '').trim().toLowerCase(),
      part: String(this.part || '').trim().toLowerCase(),
      chapter: String(this.chapter || '').trim(),
      section: String(this.section || '').trim(),
      topic: String(this.topic || '').trim(),
      question: String(this.question || '').trim(),
      options: optionTexts,
    };

    this.contentFingerprint = buildMcqContentFingerprint(identitySource);
    this.externalId = await resolveUniqueMcqExternalId({
      model: this.constructor,
      mcq: identitySource,
      excludeId: this._id,
    });

    next();
  } catch (error) {
    next(error);
  }
});

mcqSchema.index({ subject: 1, topic: 1, difficulty: 1 });
mcqSchema.index({ subject: 1, part: 1, chapter: 1, section: 1, difficulty: 1 });
mcqSchema.index({ subject: 1, difficulty: 1, createdAt: -1 });
mcqSchema.index({ externalId: 1 }, { unique: true, sparse: true });
mcqSchema.index({ contentFingerprint: 1, subject: 1, chapter: 1, section: 1, topic: 1 });

export const MCQModel = mongoose.models.MCQ || mongoose.model('MCQ', mcqSchema);
