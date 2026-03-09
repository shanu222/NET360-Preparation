import mongoose from 'mongoose';

const premiumActivationTokenSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    premiumRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PremiumSubscriptionRequest', required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'used', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

premiumActivationTokenSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const PremiumActivationTokenModel =
  mongoose.models.PremiumActivationToken || mongoose.model('PremiumActivationToken', premiumActivationTokenSchema);
