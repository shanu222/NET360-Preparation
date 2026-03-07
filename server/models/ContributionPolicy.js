import mongoose from 'mongoose';

const contributionPolicySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    maxSubmissionsPerDay: { type: Number, default: 5, min: 1, max: 100 },
    maxFilesPerSubmission: { type: Number, default: 3, min: 1, max: 10 },
    maxFileSizeBytes: { type: Number, default: 1024 * 1024, min: 64 * 1024, max: 10 * 1024 * 1024 },
    allowedMimeTypes: {
      type: [String],
      default: [
        'image/jpeg',
        'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
    },
    blockDurationMinutes: { type: Number, default: 180, min: 5, max: 10080 },
    updatedByEmail: { type: String, default: '' },
  },
  { timestamps: true },
);

export const ContributionPolicyModel =
  mongoose.models.ContributionPolicy || mongoose.model('ContributionPolicy', contributionPolicySchema);
