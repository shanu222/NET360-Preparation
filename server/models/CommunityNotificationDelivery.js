import mongoose from 'mongoose';

const communityNotificationDeliverySchema = new mongoose.Schema(
  {
    deliveryId: { type: String, default: '', trim: true },
    eventKey: { type: String, required: true, trim: true, index: true },
    userId: { type: String, required: true, trim: true, index: true },
    recipientEmail: { type: String, default: '', trim: true, lowercase: true, index: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

communityNotificationDeliverySchema.index({ eventKey: 1, userId: 1 }, { unique: true });
communityNotificationDeliverySchema.index({ deliveryId: 1 }, { unique: true, sparse: true });

export const CommunityNotificationDeliveryModel =
  mongoose.models.CommunityNotificationDelivery
  || mongoose.model('CommunityNotificationDelivery', communityNotificationDeliverySchema);
