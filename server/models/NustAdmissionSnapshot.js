import mongoose from 'mongoose';

const nustAdmissionSnapshotSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'latest', trim: true },
    contentHash: { type: String, default: '', index: true },
    sourceUrl: { type: String, default: 'https://ugadmissions.nust.edu.pk/' },
    sessionLabel: { type: String, default: '' },
    dates: { type: Array, default: [] },
    notices: { type: Array, default: [] },
    extras: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastSuccessAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
  },
  { timestamps: true },
);

export const NustAdmissionSnapshotModel =
  mongoose.models.NustAdmissionSnapshot
  || mongoose.model('NustAdmissionSnapshot', nustAdmissionSnapshotSchema);
