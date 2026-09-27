import mongoose from 'mongoose';

const analyticsDailyReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, trim: true, unique: true, index: true },
    reportDate: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending', index: true },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
    recipients: { type: [String], default: [] },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true, collection: 'analytics_daily_reports' },
);

export const AnalyticsDailyReportModel =
  mongoose.models.AnalyticsDailyReport
  || mongoose.model('AnalyticsDailyReport', analyticsDailyReportSchema);
