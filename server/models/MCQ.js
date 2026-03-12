import mongoose from 'mongoose';

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
    externalId: { type: String, default: '' },
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

mcqSchema.index({ subject: 1, topic: 1, difficulty: 1 });
mcqSchema.index({ subject: 1, part: 1, chapter: 1, section: 1, difficulty: 1 });
mcqSchema.index({ subject: 1, difficulty: 1, createdAt: -1 });

export const MCQModel = mongoose.models.MCQ || mongoose.model('MCQ', mcqSchema);
