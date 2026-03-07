import mongoose from 'mongoose';

const aiUsageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, ref: 'User' },
    day: { type: String, required: true },
    chatCount: { type: Number, default: 0 },
    solverCount: { type: Number, default: 0 },
    tokenConsumed: { type: Number, default: 0 },
  },
  { timestamps: true },
);

aiUsageSchema.index({ userId: 1, day: 1 }, { unique: true });

export const AIUsageModel = mongoose.models.AIUsage || mongoose.model('AIUsage', aiUsageSchema);
