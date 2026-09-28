import mongoose from 'mongoose';

const userNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, default: 'video.published', index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: '' },
    videoId: { type: String, default: '' },
    sectionId: { type: String, default: '' },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

userNotificationSchema.index({ userId: 1, createdAt: -1 });

export const UserNotificationModel = mongoose.models.UserNotification
  || mongoose.model('UserNotification', userNotificationSchema);
