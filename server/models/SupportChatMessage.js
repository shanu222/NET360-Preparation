import mongoose from 'mongoose';

const supportChatMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    senderRole: { type: String, enum: ['user', 'admin'], required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    text: { type: String, required: true, trim: true },
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
