import mongoose from 'mongoose';

const runtimeConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    encryptedValue: { type: String, required: true },
    isSecret: { type: Boolean, default: true },
    description: { type: String, default: '' },
    updatedByEmail: { type: String, default: '' },
  },
  { timestamps: true },
);

export const RuntimeConfigModel = mongoose.models.RuntimeConfig || mongoose.model('RuntimeConfig', runtimeConfigSchema);
