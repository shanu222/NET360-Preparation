import mongoose from 'mongoose';

const preferencesSchema = new mongoose.Schema(
  {
    emailNotifications: { type: Boolean, default: true },
    dailyReminders: { type: Boolean, default: true },
    performanceReports: { type: Boolean, default: true },
  },
  { _id: false },
);

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { _id: false },
);

const progressSchema = new mongoose.Schema(
  {
    questionsSolved: { type: Number, default: 0 },
    testsCompleted: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    completedTests: { type: [String], default: [] },
    scores: { type: [Number], default: [] },
    studyHours: { type: Number, default: 0 },
    weakTopics: { type: [String], default: [] },
    practiceHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    analytics: {
      weeklyProgress: { type: [mongoose.Schema.Types.Mixed], default: [] },
      accuracyTrend: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    studyPlan: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    city: { type: String, default: '' },
    targetProgram: { type: String, default: '' },
    testSeries: { type: String, default: '' },
    sscPercentage: { type: String, default: '' },
    hsscPercentage: { type: String, default: '' },
    testDate: { type: String, default: '' },
    role: { type: String, enum: ['student', 'admin'], default: 'student', index: true },
    preferences: { type: preferencesSchema, default: () => ({}) },
    progress: { type: progressSchema, default: () => ({}) },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
