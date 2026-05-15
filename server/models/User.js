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

const activeSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true },
    deviceId: { type: String, required: true },
    startedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    lastIp: { type: String, default: '' },
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

const subscriptionSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['inactive', 'trial', 'active', 'expired', 'cancelled'], default: 'inactive', index: true },
    planId: { type: String, default: '' },
    billingCycle: { type: String, enum: ['monthly', 'yearly', 'six_month', ''], default: '' },
    startedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    paymentReference: { type: String, default: '' },
    lastActivatedAt: { type: Date, default: null },
    /** One 7-day trial per account; enforced server-side */
    hasUsedTrial: { type: Boolean, default: false },
    trialStartedAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    paymentGateway: { type: String, default: '' },
    lastPaymentAt: { type: Date, default: null },
  },
  { _id: false },
);

const manualAccessGrantSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['inactive', 'active', 'expired', 'revoked'], default: 'inactive', index: true },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    durationDays: { type: Number, default: 0 },
    source: { type: String, default: '' },
    grantedAt: { type: Date, default: null },
    grantedByUserId: { type: String, default: '' },
    grantedByEmail: { type: String, default: '' },
    lastUpdatedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const accessControlsSchema = new mongoose.Schema(
  {
    mentorManual: { type: manualAccessGrantSchema, default: () => ({}) },
    preparationManual: { type: manualAccessGrantSchema, default: () => ({}) },
  },
  { _id: false },
);

const paidServicesSchema = new mongoose.Schema(
  {
    tests: { type: manualAccessGrantSchema, default: () => ({}) },
    preparation: { type: manualAccessGrantSchema, default: () => ({}) },
    community: { type: manualAccessGrantSchema, default: () => ({}) },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** Legacy bcrypt hash (same format as passwordHash). Prefer passwordHash; use .select('+password') on login. */
    password: { type: String, select: false },
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
    authProvider: { type: String, enum: ['local', 'firebase'], default: 'local', index: true },
    authProviderDetail: { type: String, default: 'unknown', index: true },
    firebaseUid: { type: String, default: '', index: true },
    displayName: { type: String, default: '' },
    profilePhotoUrl: { type: String, default: '' },
    platformUsage: {
      type: {
        lastPlatform: { type: String, default: 'unknown' },
        lastSeenAt: { type: Date, default: null },
        androidLogins: { type: Number, default: 0 },
        webLogins: { type: Number, default: 0 },
        unknownLogins: { type: Number, default: 0 },
      },
      default: () => ({}),
      _id: false,
    },
    preferences: { type: preferencesSchema, default: () => ({}) },
    progress: { type: progressSchema, default: () => ({}) },
    subscription: { type: subscriptionSchema, default: () => ({}) },
    accessControls: { type: accessControlsSchema, default: () => ({}) },
    paidServices: { type: paidServicesSchema, default: () => ({}) },
    /**
     * Single-device login session id. Preferred over `activeSession.sessionId` for auth checks.
     * Backwards compatible: legacy accounts may only have `activeSession`.
     */
    activeSessionId: { type: String, default: '', index: true },
    /** Last successful login timestamp (any provider). */
    lastLoginAt: { type: Date, default: null },
    activeSession: { type: activeSessionSchema, default: null },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    resetPasswordTokenHash: { type: String, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
    securityQuestion: { type: String, default: '' },
    securityAnswerHash: { type: String, default: '' },
    /** AES-256-GCM ciphertext (base64); admin-only recovery. Bcrypt remains canonical for verification. */
    securityAnswerEncrypted: { type: String, default: '' },
    securityChallengeTokenHash: { type: String, default: null },
    securityChallengeExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, updatedAt: -1 });
userSchema.index({ role: 1, authProvider: 1, lastLoginAt: -1 });
userSchema.index({ authProvider: 1, authProviderDetail: 1, lastLoginAt: -1 });

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
