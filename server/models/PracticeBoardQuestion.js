import mongoose from 'mongoose';

const practiceBoardFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    dataUrl: { type: String, required: true },
  },
  { _id: false },
);

const practiceBoardQuestionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, index: true },
    difficulty: { type: String, required: true, index: true },
    questionText: { type: String, default: '' },
    questionFile: { type: practiceBoardFileSchema, default: null },
    solutionText: { type: String, default: '' },
    solutionFile: { type: practiceBoardFileSchema, default: null },
    source: { type: String, default: 'Admin' },
  },
  { timestamps: true },
);

practiceBoardQuestionSchema.index({ subject: 1, difficulty: 1, createdAt: -1 });

export const PracticeBoardQuestionModel =
  mongoose.models.PracticeBoardQuestion || mongoose.model('PracticeBoardQuestion', practiceBoardQuestionSchema);
