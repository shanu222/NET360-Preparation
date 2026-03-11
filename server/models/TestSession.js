import mongoose from 'mongoose';

const sessionQuestionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    difficulty: { type: String, required: true },
    explanation: { type: String, default: '' },
  },
  { _id: false },
);

const testSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'User' },
    subject: { type: String, required: true, index: true },
    difficulty: { type: String, required: true },
    topic: { type: String, required: true },
    mode: { type: String, enum: ['topic', 'mock', 'adaptive'], required: true, index: true },
    questions: { type: [sessionQuestionSchema], default: [] },
    answerKey: { type: Map, of: String, default: {} },
    questionIds: { type: [String], default: [] },
    questionCount: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null, index: true },
    cancelledAt: { type: Date, default: null, index: true },
    cancelReason: { type: String, default: '' },
    cancelTrigger: { type: String, default: '' },
  },
  { timestamps: true },
);

testSessionSchema.index({ userId: 1, startedAt: -1 });

export const TestSessionModel = mongoose.models.TestSession || mongoose.model('TestSession', testSessionSchema);
