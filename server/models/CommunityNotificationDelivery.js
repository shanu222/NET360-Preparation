import mongoose from 'mongoose';

const communityNotificationDeliverySchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, trim: true, index: true },
    userId: { type: String, required: true, trim: true, index: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

communityNotificationDeliverySchema.index({ eventKey: 1, userId: 1 }, { unique: true });

export const CommunityNotificationDeliveryModel =
  mongoose.models.CommunityNotificationDelivery
  || mongoose.model('CommunityNotificationDelivery', communityNotificationDeliverySchema);
