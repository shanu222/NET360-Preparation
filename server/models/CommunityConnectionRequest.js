import mongoose from 'mongoose';

const communityConnectionRequestSchema = new mongoose.Schema(
  {
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true },
);

communityConnectionRequestSchema.index({ fromUserId: 1, toUserId: 1, status: 1 });

export const CommunityConnectionRequestModel =
  mongoose.models.CommunityConnectionRequest || mongoose.model('CommunityConnectionRequest', communityConnectionRequestSchema);
