import mongoose from 'mongoose';

const communityConnectionSchema = new mongoose.Schema(
  {
    participantA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    participantKey: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true },
);

export const CommunityConnectionModel =
  mongoose.models.CommunityConnection || mongoose.model('CommunityConnection', communityConnectionSchema);
