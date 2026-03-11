import mongoose from 'mongoose';

const supportChatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderRole: { type: String, enum: ['user', 'admin'], required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    messageType: {
      type: String,
      enum: ['text', 'file'],
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
    reactions: {
      type: [
        {
          senderRole: { type: String, enum: ['user', 'admin'], required: true },
          senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          emoji: { type: String, required: true, trim: true },
          reactedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    readByUser: { type: Boolean, default: false },
    readByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

supportChatMessageSchema.index({ userId: 1, createdAt: 1 });
supportChatMessageSchema.index({ userId: 1, readByAdmin: 1, senderRole: 1 });
supportChatMessageSchema.index({ userId: 1, readByUser: 1, senderRole: 1 });

export const SupportChatMessageModel =
  mongoose.models.SupportChatMessage || mongoose.model('SupportChatMessage', supportChatMessageSchema);
