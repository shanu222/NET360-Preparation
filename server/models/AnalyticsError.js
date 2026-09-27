import mongoose from 'mongoose';

const analyticsErrorSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, trim: true, unique: true, index: true },
    sessionId: { type: String, default: '', trim: true, index: true },
    userId: { type: String, default: '', trim: true, index: true },
    anonymousId: { type: String, default: '', trim: true },
    platform: { type: String, default: 'web', trim: true, lowercase: true, index: true },
    appVersion: { type: String, default: '', trim: true },
    osVersion: { type: String, default: '', trim: true },
    screen: { type: String, default: '', trim: true },
    category: { type: String, default: 'GENERAL', trim: true, uppercase: true, index: true },
    eventType: { type: String, required: true, trim: true, index: true },
    errorCode: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true },
    resource: { type: String, default: '', trim: true },
    statusCode: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'analytics_errors' },
);

analyticsErrorSchema.index({ timestamp: -1, category: 1 });
analyticsErrorSchema.index({ platform: 1, eventType: 1, timestamp: -1 });

export const AnalyticsErrorModel =
  mongoose.models.AnalyticsError
  || mongoose.model('AnalyticsError', analyticsErrorSchema);
