import mongoose from 'mongoose';

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
    options: { type: [String], required: true },
    answer: { type: String, required: true },
    tip: { type: String, default: '' },
    difficulty: { type: String, required: true, index: true },
    source: { type: String, default: 'Imported' },
  },
  { timestamps: true },
);

mcqSchema.index({ subject: 1, topic: 1, difficulty: 1 });
mcqSchema.index({ subject: 1, part: 1, chapter: 1, section: 1, difficulty: 1 });

export const MCQModel = mongoose.models.MCQ || mongoose.model('MCQ', mcqSchema);
