import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'TestSession' },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'User' },
    subject: { type: String, required: true, index: true },
    topic: { type: String, required: true },
    difficulty: { type: String, required: true },
    mode: { type: String, enum: ['topic', 'mock', 'adaptive'], required: true, index: true },
    score: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    wrongAnswers: { type: Number, required: true },
    unanswered: { type: Number, required: true },
    submittedAnswers: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    attemptedAt: { type: Date, required: true, index: true },
    submittedAt: { type: Date, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

attemptSchema.index({ userId: 1, attemptedAt: -1 });
attemptSchema.index({ userId: 1, subject: 1, attemptedAt: -1 });

export const AttemptModel = mongoose.models.Attempt || mongoose.model('Attempt', attemptSchema);
