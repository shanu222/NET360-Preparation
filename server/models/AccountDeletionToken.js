import mongoose from 'mongoose';

/**
 * Single-use email link tokens for Google/Firebase-managed student self-service deletion.
 * Raw token is never stored — only SHA-256 hash. TTL index removes expired rows.
 */
const accountDeletionTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    authProviderSnapshot: { type: String, required: true, trim: true },
    /** SHA-256 prefix of session/device/UA fingerprint at request time (audit only). */
    sessionFingerprint: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

accountDeletionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AccountDeletionTokenModel =
  mongoose.models.AccountDeletionToken || mongoose.model('AccountDeletionToken', accountDeletionTokenSchema);
