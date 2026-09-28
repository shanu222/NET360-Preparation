import mongoose from 'mongoose';

const videoEmailReceiptSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    videoId: { type: String, default: '', index: true },
    userId: { type: String, default: '', index: true },
    status: { type: String, enum: ['sent', 'skipped', 'failed'], required: true },
    provider: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { timestamps: true },
);

export const VideoEmailReceiptModel = mongoose.models.VideoEmailReceipt
  || mongoose.model('VideoEmailReceipt', videoEmailReceiptSchema);
