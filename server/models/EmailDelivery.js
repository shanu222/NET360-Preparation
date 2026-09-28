import mongoose from 'mongoose';

const emailDeliverySchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, trim: true },
    userId: { type: String, default: '', trim: true },
    recipientEmail: { type: String, default: '', trim: true, lowercase: true },
    emailType: { type: String, default: '', trim: true },
    subject: { type: String, default: '' },
    text: { type: String, default: '' },
    html: { type: String, default: '' },
    provider: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['sending', 'sent', 'retry', 'failed', 'skipped'],
      default: 'sending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    providerMessageId: { type: String, default: '', trim: true },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    errorCategory: { type: String, default: '' },
    nextAttemptAt: { type: Date, default: null },
    allowSmtpFallback: { type: Boolean, default: false },
  },
  { timestamps: true },
);

emailDeliverySchema.index({ eventId: 1 }, { unique: true });
emailDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

export const EmailDeliveryModel = mongoose.models.EmailDelivery
  || mongoose.model('EmailDelivery', emailDeliverySchema);
