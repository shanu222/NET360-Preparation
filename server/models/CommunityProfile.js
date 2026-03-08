import mongoose from 'mongoose';

const communityProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true, unique: true, index: true },
    profilePictureUrl: { type: String, default: '' },
    shareProfilePicture: { type: Boolean, default: false },
    favoriteSubjects: { type: [String], default: [] },
    targetNetType: { type: String, default: 'net-engineering', index: true },
    subjectsNeedHelp: { type: [String], default: [] },
    preparationLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'intermediate', index: true },
    studyTimePreference: { type: String, enum: ['morning', 'evening', 'night', 'flexible'], default: 'flexible', index: true },
    testScoreRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 200 },
    },
    bio: { type: String, default: '' },
  },
  { timestamps: true },
);

export const CommunityProfileModel =
  mongoose.models.CommunityProfile || mongoose.model('CommunityProfile', communityProfileSchema);
