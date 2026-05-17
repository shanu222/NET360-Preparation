import mongoose from 'mongoose';

const freeTrialLedgerSchema = new mongoose.Schema(
  {
    emailHistory: { type: [String], default: [] },
    firebaseUidHistory: { type: [String], default: [] },
    deviceFingerprintHistory: { type: [String], default: [] },
    ipHistory: { type: [String], default: [] },
    originalTrialStartedAt: { type: Date, default: null },
    originalTrialEndsAt: { type: Date, default: null, index: true },
    trialConsumed: { type: Boolean, default: false, index: true },
    trialConsumedAt: { type: Date, default: null },
    linkedDeletedAccountIds: { type: [String], default: [] },
    latestAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true },
);

freeTrialLedgerSchema.index({ emailHistory: 1 });
freeTrialLedgerSchema.index({ firebaseUidHistory: 1 });
freeTrialLedgerSchema.index({ deviceFingerprintHistory: 1 });

export const FreeTrialLedgerModel =
  mongoose.models.FreeTrialLedger || mongoose.model('FreeTrialLedger', freeTrialLedgerSchema);
