import mongoose from 'mongoose';

const analyticsSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, trim: true, unique: true, index: true },
    userId: { type: String, default: '', trim: true, index: true },
    anonymousId: { type: String, default: '', trim: true, index: true },
    platform: { type: String, default: 'web', trim: true, lowercase: true, index: true },
    appVersion: { type: String, default: '', trim: true },
    osVersion: { type: String, default: '', trim: true },
    startedAt: { type: Date, default: Date.now, index: true },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    endedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'analytics_sessions' },
);

analyticsSessionSchema.index({ platform: 1, startedAt: -1 });
analyticsSessionSchema.index({ userId: 1, lastActivityAt: -1 });

export const AnalyticsSessionModel =
  mongoose.models.AnalyticsSession
  || mongoose.model('AnalyticsSession', analyticsSessionSchema);
