import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    dataUrl: { type: String, required: true },
  },
  { _id: false },
);

const questionSubmissionSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, index: true },
    questionText: { type: String, default: '' },
    attachments: { type: [attachmentSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'converted'],
      default: 'pending',
      index: true,
    },
    convertedTo: {
      type: String,
      enum: ['', 'mcq', 'practice'],
      default: '',
    },
    submittedByName: { type: String, default: '' },
    submittedByEmail: { type: String, default: '' },
    submittedByUserId: { type: String, default: '' },
    reviewNotes: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewedByEmail: { type: String, default: '' },
  },
  { timestamps: true },
);

questionSubmissionSchema.index({ subject: 1, status: 1, createdAt: -1 });

export const QuestionSubmissionModel =
  mongoose.models.QuestionSubmission || mongoose.model('QuestionSubmission', questionSubmissionSchema);
