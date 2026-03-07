import mongoose from 'mongoose';

const submissionRestrictionSchema = new mongoose.Schema(
  {
    actorKey: { type: String, required: true, unique: true, index: true },
    blockedUntil: { type: Date, default: null, index: true },
    reason: { type: String, default: '' },
    lastViolationAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const SubmissionRestrictionModel =
  mongoose.models.SubmissionRestriction || mongoose.model('SubmissionRestriction', submissionRestrictionSchema);
