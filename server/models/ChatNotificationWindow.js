import mongoose from 'mongoose';

const chatNotificationWindowSchema = new mongoose.Schema(
  {
    windowKey: { type: String, required: true, unique: true, trim: true, index: true },
    lastNotifiedAt: { type: Date, default: null },
    lastReplyAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const ChatNotificationWindowModel =
  mongoose.models.ChatNotificationWindow
  || mongoose.model('ChatNotificationWindow', chatNotificationWindowSchema);
