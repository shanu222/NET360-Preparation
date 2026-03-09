import mongoose from 'mongoose';

const recoveryDispatchSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
    destination: { type: String, default: '' },
    status: { type: String, enum: ['sent', 'skipped', 'failed'], default: 'skipped' },
    provider: { type: String, default: 'simulated' },
    detail: { type: String, default: '' },
  },
  { _id: false },
);

const passwordRecoveryRequestSchema = new mongoose.Schema(
  {
    identifier: { type: String, required: true, trim: true, index: true },
    normalizedIdentifier: { type: String, required: true, trim: true, index: true },
    matchedBy: { type: String, enum: ['email', 'mobile', 'none'], default: 'none', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: '' },
    email: { type: String, default: '', trim: true, index: true },
    mobileNumber: { type: String, default: '', trim: true, index: true },
    recoveryStatus: {
      type: String,
      enum: ['not_found', 'sent', 'partial', 'failed'],
      required: true,
      index: true,
    },
    dispatches: { type: [recoveryDispatchSchema], default: [] },
    tokenExpiresAt: { type: Date, default: null },
    requestedIp: { type: String, default: '' },
    requestedUserAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

passwordRecoveryRequestSchema.index({ createdAt: -1 });
passwordRecoveryRequestSchema.index({ recoveryStatus: 1, createdAt: -1 });

export const PasswordRecoveryRequestModel =
  mongoose.models.PasswordRecoveryRequest || mongoose.model('PasswordRecoveryRequest', passwordRecoveryRequestSchema);
