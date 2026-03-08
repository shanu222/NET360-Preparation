import mongoose from 'mongoose';

const communityProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true, unique: true, index: true },
    profilePictureUrl: { type: String, default: '' },
    shareProfilePicture: { type: Boolean, default: false },
    favoriteSubjects: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const CommunityProfileModel =
  mongoose.models.CommunityProfile || mongoose.model('CommunityProfile', communityProfileSchema);
