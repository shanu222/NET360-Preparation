import mongoose from 'mongoose';

const practiceBoardQuestionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, index: true },
    chapter: { type: String, default: '', index: true },
    section: { type: String, default: '', index: true },
    difficulty: { type: String, required: true, index: true },
    questionText: { type: String, default: '' },
    questionImageUrl: { type: String, default: '' },
    solutionText: { type: String, default: '' },
    solutionImageUrl: { type: String, default: '' },
    source: { type: String, default: 'Admin' },
  },
  { timestamps: true },
);

practiceBoardQuestionSchema.index({ subject: 1, chapter: 1, section: 1, difficulty: 1 });

export const PracticeBoardQuestionModel =
  mongoose.models.PracticeBoardQuestion || mongoose.model('PracticeBoardQuestion', practiceBoardQuestionSchema);
