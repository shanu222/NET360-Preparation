import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, trim: true },
    upvotes: { type: Number, default: 0 },
    upvotedByUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

const communityRoomPostSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['discussion', 'doubt'], default: 'discussion', index: true },
    title: { type: String, default: '' },
    text: { type: String, required: true, trim: true },
    subject: { type: String, default: '' },
    upvotes: { type: Number, default: 0 },
    upvotedByUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    answers: { type: [answerSchema], default: [] },
    flagged: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

communityRoomPostSchema.index({ roomId: 1, createdAt: -1 });
communityRoomPostSchema.index({ roomId: 1, type: 1, createdAt: -1 });
communityRoomPostSchema.index({ authorUserId: 1, createdAt: -1 });

export const CommunityRoomPostModel =
  mongoose.models.CommunityRoomPost || mongoose.model('CommunityRoomPost', communityRoomPostSchema);
