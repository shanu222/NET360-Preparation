import mongoose from 'mongoose';

const chatSnapshotMessageSchema = new mongoose.Schema(
  {
    senderUserId: { type: String, default: '' },
    text: { type: String, default: '' },
    createdAt: { type: Date, default: null },
  },
  { _id: false },
);

const communityReportSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityConnection', required: true, index: true },
    reporterUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'dismissed', 'actioned'],
      default: 'open',
      index: true,
    },
    moderation: {
      result: { type: String, enum: ['clean', 'harmful'], default: 'clean' },
      reasons: { type: [String], default: [] },
      score: { type: Number, default: 0 },
      violatorUserId: { type: String, default: '' },
      autoBlocked: { type: Boolean, default: false },
      reviewedByEmail: { type: String, default: '' },
      reviewedAt: { type: Date, default: null },
    },
    chatSnapshot: { type: [chatSnapshotMessageSchema], default: [] },
  },
  { timestamps: true },
);

communityReportSchema.index({ status: 1, createdAt: -1 });

export const CommunityReportModel =
  mongoose.models.CommunityReport || mongoose.model('CommunityReport', communityReportSchema);
