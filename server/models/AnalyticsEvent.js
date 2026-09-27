import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, trim: true, unique: true, index: true },
    sessionId: { type: String, default: '', trim: true, index: true },
    userId: { type: String, default: '', trim: true, index: true },
    anonymousId: { type: String, default: '', trim: true },
    platform: { type: String, default: 'web', trim: true, lowercase: true, index: true },
    appVersion: { type: String, default: '', trim: true },
    screen: { type: String, default: '', trim: true },
    feature: { type: String, default: '', trim: true, index: true },
    eventType: { type: String, required: true, trim: true, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'analytics_events' },
);

analyticsEventSchema.index({ timestamp: -1, eventType: 1 });
analyticsEventSchema.index({ platform: 1, timestamp: -1 });

export const AnalyticsEventModel =
  mongoose.models.AnalyticsEvent
  || mongoose.model('AnalyticsEvent', analyticsEventSchema);
