import mongoose from 'mongoose';

const signupRequestSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    mobileNumber: { type: String, required: true, trim: true, index: true },
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
    signupTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'SignupToken', default: null },
  },
  { timestamps: true },
);

signupRequestSchema.index({ email: 1, status: 1, createdAt: -1 });

export const SignupRequestModel =
  mongoose.models.SignupRequest || mongoose.model('SignupRequest', signupRequestSchema);
