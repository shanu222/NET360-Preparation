import mongoose from 'mongoose';

const communityConnectionSchema = new mongoose.Schema(
  {
    participantA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantKey: { type: String, required: true, unique: true, index: true },
    blockedByUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

communityConnectionSchema.index({ participantA: 1, createdAt: -1 });
communityConnectionSchema.index({ participantB: 1, createdAt: -1 });

export const CommunityConnectionModel =
  mongoose.models.CommunityConnection || mongoose.model('CommunityConnection', communityConnectionSchema);
