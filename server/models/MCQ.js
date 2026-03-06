import mongoose from 'mongoose';

const mcqSchema = new mongoose.Schema(
  {
    externalId: { type: String, default: '' },
    subject: { type: String, required: true, index: true },
    topic: { type: String, required: true, index: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    answer: { type: String, required: true },
    tip: { type: String, default: '' },
    difficulty: { type: String, required: true, index: true },
    source: { type: String, default: 'NET Dataset' },
  },
  { timestamps: true },
);

mcqSchema.index({ subject: 1, topic: 1, difficulty: 1 });

export const MCQModel = mongoose.models.MCQ || mongoose.model('MCQ', mcqSchema);
