import mongoose from 'mongoose';

const globalAccessGrantSchema = new mongoose.Schema(
  {
    accessType: { type: String, enum: ['mentor', 'preparation'], required: true, unique: true, index: true },
    status: { type: String, enum: ['inactive', 'active', 'expired', 'revoked'], default: 'inactive', index: true },
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    durationDays: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    grantedByUserId: { type: String, default: '' },
    grantedByEmail: { type: String, default: '' },
    lastActionByUserId: { type: String, default: '' },
    lastActionByEmail: { type: String, default: '' },
    lastActionAt: { type: Date, default: null },
  },
  { timestamps: true },
);

globalAccessGrantSchema.index({ accessType: 1, status: 1 });

export const GlobalAccessGrantModel =
  mongoose.models.GlobalAccessGrant || mongoose.model('GlobalAccessGrant', globalAccessGrantSchema);
