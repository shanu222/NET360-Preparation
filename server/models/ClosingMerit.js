import mongoose from 'mongoose';

const closingMeritSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    institution: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    categoryKey: { type: String, default: 'engineering', trim: true },
    categoryLabel: { type: String, default: 'Engineering Programs', trim: true },
    closingMerit: { type: Number, default: null },
    meritPosition: { type: Number, default: null },
    meritStatus: { type: String, enum: ['real', 'estimated'], default: 'estimated' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

closingMeritSchema.index({ categoryKey: 1, sortOrder: 1, name: 1 });
closingMeritSchema.index({ name: 1, institution: 1, location: 1 }, { unique: true });

export const ClosingMeritModel =
  mongoose.models.ClosingMerit || mongoose.model('ClosingMerit', closingMeritSchema);

const closingMeritMetaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    seeded: { type: Boolean, default: false },
    year: { type: Number, default: 2026 },
    documentApplied: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ClosingMeritMetaModel =
  mongoose.models.ClosingMeritMeta || mongoose.model('ClosingMeritMeta', closingMeritMetaSchema);
