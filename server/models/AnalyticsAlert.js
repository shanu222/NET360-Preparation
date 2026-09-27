import mongoose from 'mongoose';

const analyticsAlertSchema = new mongoose.Schema(
  {
    deduplicationKey: { type: String, required: true, trim: true, unique: true, index: true },
    eventType: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    platform: { type: String, default: '', trim: true },
    userId: { type: String, default: '', trim: true },
    resource: { type: String, default: '', trim: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'analytics_alerts' },
);

export const AnalyticsAlertModel =
  mongoose.models.AnalyticsAlert
  || mongoose.model('AnalyticsAlert', analyticsAlertSchema);
