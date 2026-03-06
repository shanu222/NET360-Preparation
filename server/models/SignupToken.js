import mongoose from 'mongoose';

const signupTokenSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    signupRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'SignupRequest', required: true, index: true },
    status: {
      type: String,
      enum: ['active', 'used', 'expired', 'revoked'],
      default: 'active',
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

signupTokenSchema.index({ email: 1, status: 1, createdAt: -1 });

export const SignupTokenModel =
  mongoose.models.SignupToken || mongoose.model('SignupToken', signupTokenSchema);
