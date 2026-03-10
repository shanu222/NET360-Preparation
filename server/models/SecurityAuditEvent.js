import mongoose from 'mongoose';

const securityAuditEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, index: true },
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning', index: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorEmail: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    path: { type: String, default: '' },
    method: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

securityAuditEventSchema.index({ occurredAt: -1, severity: 1 });

export const SecurityAuditEventModel =
  mongoose.models.SecurityAuditEvent || mongoose.model('SecurityAuditEvent', securityAuditEventSchema);
