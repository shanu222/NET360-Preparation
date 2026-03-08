import mongoose from 'mongoose';

const communityBlockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    blocked: { type: Boolean, default: true, index: true },
    reason: { type: String, default: '' },
    sourceReportId: { type: String, default: '' },
    blockedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const CommunityBlockModel =
  mongoose.models.CommunityBlock || mongoose.model('CommunityBlock', communityBlockSchema);
