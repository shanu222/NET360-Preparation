import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    subject: { type: String, default: '' },
    topic: { type: String, default: '' },
    question: { type: String, default: '' },
    options: { type: [String], default: [] },
    difficulty: { type: String, default: 'Medium' },
    correctAnswer: { type: String, default: '' },
  },
  { _id: false },
);

const quizAnswerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    selectedOption: { type: String, default: '' },
  },
  { _id: false },
);

const quizPlayerResultSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submitted: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    elapsedSeconds: { type: Number, default: 0 },
    answers: { type: [quizAnswerSchema], default: [] },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unansweredCount: { type: Number, default: 0 },
    accuracyScore: { type: Number, default: 0 },
    speedScore: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
  },
  { _id: false },
);

const liveProgressSchema = new mongoose.Schema(
  {
    answeredCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    elapsedSeconds: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const communityQuizChallengeSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityConnection', default: null, index: true },
    challengerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    opponentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: {
      type: String,
      enum: ['subject-wise', 'mock', 'adaptive', 'custom'],
      required: true,
      index: true,
    },
    challengeType: {
      type: String,
      enum: ['async', 'live'],
      default: 'async',
      index: true,
    },
    subject: { type: String, default: '' },
    topic: { type: String, default: '' },
    difficulty: { type: String, default: 'Medium' },
    questionCount: { type: Number, default: 20 },
    durationSeconds: { type: Number, default: 1800 },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled', 'expired'],
      default: 'pending',
      index: true,
    },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date, default: null },
    acceptedDeadlineAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    winnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    questions: { type: [quizQuestionSchema], default: [] },
    challengerLiveProgress: { type: liveProgressSchema, default: () => ({}) },
    opponentLiveProgress: { type: liveProgressSchema, default: () => ({}) },
    challengerResult: { type: quizPlayerResultSchema, required: true },
    opponentResult: { type: quizPlayerResultSchema, required: true },
  },
  { timestamps: true },
);

communityQuizChallengeSchema.index({ challengerUserId: 1, createdAt: -1 });
communityQuizChallengeSchema.index({ opponentUserId: 1, createdAt: -1 });
communityQuizChallengeSchema.index({ status: 1, createdAt: -1 });

export const CommunityQuizChallengeModel =
  mongoose.models.CommunityQuizChallenge || mongoose.model('CommunityQuizChallenge', communityQuizChallengeSchema);
