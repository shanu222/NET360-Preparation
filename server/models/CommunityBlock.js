import mongoose from 'mongoose';

const communityBlockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    blocked: { type: Boolean, default: true, index: true },
    reason: { type: String, default: '' },
    sourceReportId: { type: String, default: '' },
    blockedAt: { type: Date, default: Date.now },
    warningCount: { type: Number, default: 0 },
    mutedUntil: { type: Date, default: null, index: true },
    bannedUntil: { type: Date, default: null, index: true },
    lastAction: { type: String, enum: ['none', 'warning', 'mute', 'ban'], default: 'none' },
  },
  { timestamps: true },
);

export const CommunityBlockModel =
  mongoose.models.CommunityBlock || mongoose.model('CommunityBlock', communityBlockSchema);
