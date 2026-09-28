import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, index: true },
    subjectId: { type: String, required: true, index: true },
    part: { type: String, default: '', index: true },
    partId: { type: String, default: '', index: true },
    chapter: { type: String, default: '', index: true },
    chapterId: { type: String, default: '', index: true },
    topic: { type: String, default: '', index: true },
    topicId: { type: String, default: '', index: true },
    section: { type: String, required: true, index: true },
    sectionId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    r2Bucket: { type: String, required: true },
    r2ObjectKey: { type: String, required: true, unique: true, index: true },
    thumbnailObjectKey: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: 'video/mp4' },
    displayOrder: { type: Number, default: 1, index: true },
    status: { type: String, enum: ['draft', 'published', 'unpublished', 'disabled'], default: 'draft', index: true },
    uploadComplete: { type: Boolean, default: false, index: true },
    uploadedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    publishedNotifySentAt: { type: Date, default: null },
    publicationNotificationSent: { type: Boolean, default: false, index: true },
    publicationNotificationSentAt: { type: Date, default: null },
    uploadSessionId: { type: String, default: '', index: true },
    createdByUserId: { type: String, default: '' },
    createdByEmail: { type: String, default: '' },
  },
  { timestamps: true },
);

videoSchema.index({ sectionId: 1, status: 1, displayOrder: 1 });
videoSchema.index({ subjectId: 1, partId: 1, chapterId: 1, status: 1 });

export const VideoModel = mongoose.models.Video || mongoose.model('Video', videoSchema);
