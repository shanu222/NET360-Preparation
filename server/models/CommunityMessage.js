import mongoose from 'mongoose';

const communityMessageSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityConnection', required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true },
    readByUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

communityMessageSchema.index({ connectionId: 1, createdAt: -1 });

export const CommunityMessageModel =
  mongoose.models.CommunityMessage || mongoose.model('CommunityMessage', communityMessageSchema);
