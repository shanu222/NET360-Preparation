import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'PKR', trim: true },
    paymentMethod: {
      type: String,
      enum: ['easypaisa', 'jazzcash', 'bank_transfer', 'card', 'unknown'],
      default: 'unknown',
      index: true,
    },
    planId: { type: String, required: true, trim: true, index: true },
    /** Merchant order / basket id sent to PayFast */
    basketId: { type: String, required: true, trim: true, index: true },
    transactionId: { type: String, default: '', trim: true, index: true },
    gateway: { type: String, default: 'payfast', trim: true, index: true },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

paymentTransactionSchema.index({ userId: 1, status: 1, createdAt: -1 });
paymentTransactionSchema.index({ userId: 1, basketId: 1 }, { unique: true });
paymentTransactionSchema.index(
  { gateway: 1, transactionId: 1 },
  { sparse: true },
);

export const PaymentTransactionModel =
  mongoose.models.PaymentTransaction || mongoose.model('PaymentTransaction', paymentTransactionSchema);
