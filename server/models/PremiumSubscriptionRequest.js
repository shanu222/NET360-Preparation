import mongoose from 'mongoose';

const premiumSubscriptionRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    mobileNumber: { type: String, default: '', trim: true, index: true },
    planId: { type: String, required: true, trim: true, index: true },
    paymentMethod: {
      type: String,
      enum: ['easypaisa', 'jazzcash', 'bank_transfer', 'hbl'],
      required: true,
      index: true,
    },
    paymentTransactionId: { type: String, required: true, trim: true, index: true },
    paymentProof: {
      name: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      size: { type: Number, default: 0 },
      dataUrl: { type: String, default: '' },
    },
    contactMethod: {
      type: String,
      enum: ['sms', 'email', 'whatsapp', 'in_app'],
      default: 'in_app',
      index: true,
    },
    contactValue: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending',
      index: true,
    },
    notes: { type: String, default: '' },
    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByEmail: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    activationTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'PremiumActivationToken', default: null },
  },
  { timestamps: true },
);

premiumSubscriptionRequestSchema.index({ userId: 1, status: 1, createdAt: -1 });
premiumSubscriptionRequestSchema.index({ email: 1, status: 1, createdAt: -1 });

export const PremiumSubscriptionRequestModel =
  mongoose.models.PremiumSubscriptionRequest || mongoose.model('PremiumSubscriptionRequest', premiumSubscriptionRequestSchema);
