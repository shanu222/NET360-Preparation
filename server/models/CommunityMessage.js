import mongoose from 'mongoose';

const communityMessageSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityConnection', required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageType: {
      type: String,
      enum: ['text', 'file', 'voice', 'call-invite'],
      default: 'text',
      index: true,
    },
    text: { type: String, default: '', trim: true },
    attachment: {
      name: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      size: { type: Number, default: 0 },
      dataUrl: { type: String, default: '' },
    },
    voiceMeta: {
      durationSeconds: { type: Number, default: 0 },
    },
    callInvite: {
      mode: { type: String, enum: ['audio', 'video'], default: undefined },
      roomUrl: { type: String, default: '' },
      roomCode: { type: String, default: '' },
    },
    reactions: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          emoji: { type: String, required: true, trim: true },
          reactedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    readByUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

communityMessageSchema.index({ connectionId: 1, createdAt: -1 });
communityMessageSchema.index({ connectionId: 1, senderUserId: 1, createdAt: -1 });

export const CommunityMessageModel =
  mongoose.models.CommunityMessage || mongoose.model('CommunityMessage', communityMessageSchema);
