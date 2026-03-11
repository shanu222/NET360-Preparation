import { connectMongo } from '../server/lib/mongo.js';
import { UserModel } from '../server/models/User.js';
import { AttemptModel } from '../server/models/Attempt.js';
import { TestSessionModel } from '../server/models/TestSession.js';
import { AIUsageModel } from '../server/models/AIUsage.js';
import { PasswordRecoveryRequestModel } from '../server/models/PasswordRecoveryRequest.js';
import { SignupRequestModel } from '../server/models/SignupRequest.js';
import { SignupTokenModel } from '../server/models/SignupToken.js';
import { PremiumSubscriptionRequestModel } from '../server/models/PremiumSubscriptionRequest.js';
import { CommunityProfileModel } from '../server/models/CommunityProfile.js';
import { CommunityConnectionRequestModel } from '../server/models/CommunityConnectionRequest.js';
import { CommunityConnectionModel } from '../server/models/CommunityConnection.js';
import { CommunityMessageModel } from '../server/models/CommunityMessage.js';
import { CommunityReportModel } from '../server/models/CommunityReport.js';
import { CommunityBlockModel } from '../server/models/CommunityBlock.js';
import { CommunityRoomPostModel } from '../server/models/CommunityRoomPost.js';
import { CommunityQuizChallengeModel } from '../server/models/CommunityQuizChallenge.js';

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';
  if (!mongoUri) {
    throw new Error('Missing DB URI. Set MONGODB_URI, DATABASE_URL, or MONGO_URI.');
  }

  await connectMongo(mongoUri);

  const students = await UserModel.find({ role: { $ne: 'admin' } }).select('_id email');
  const studentIds = students.map((item) => item._id);
  const emails = students.map((item) => String(item.email || '').trim().toLowerCase()).filter(Boolean);

  if (!studentIds.length) {
    console.log('No non-admin users found. Nothing to purge.');
    process.exit(0);
  }

  await Promise.all([
    AttemptModel.deleteMany({ userId: { $in: studentIds } }),
    TestSessionModel.deleteMany({ userId: { $in: studentIds } }),
    AIUsageModel.deleteMany({ userId: { $in: studentIds } }),
    PasswordRecoveryRequestModel.deleteMany({
      $or: [
        { userId: { $in: studentIds } },
        { email: { $in: emails } },
      ],
    }),
    SignupRequestModel.deleteMany({ email: { $in: emails } }),
    SignupTokenModel.deleteMany({ email: { $in: emails } }),
    PremiumSubscriptionRequestModel.deleteMany({ userId: { $in: studentIds } }),
    CommunityProfileModel.deleteMany({ userId: { $in: studentIds } }),
    CommunityConnectionRequestModel.deleteMany({
      $or: [
        { fromUserId: { $in: studentIds } },
        { toUserId: { $in: studentIds } },
      ],
    }),
    CommunityConnectionModel.deleteMany({
      $or: [
        { participantA: { $in: studentIds } },
        { participantB: { $in: studentIds } },
      ],
    }),
    CommunityMessageModel.deleteMany({ senderUserId: { $in: studentIds } }),
    CommunityReportModel.deleteMany({
      $or: [
        { reporterUserId: { $in: studentIds } },
        { reportedUserId: { $in: studentIds } },
      ],
    }),
    CommunityBlockModel.deleteMany({ userId: { $in: studentIds } }),
    CommunityRoomPostModel.deleteMany({ authorUserId: { $in: studentIds } }),
    CommunityQuizChallengeModel.deleteMany({
      $or: [
        { challengerUserId: { $in: studentIds } },
        { opponentUserId: { $in: studentIds } },
      ],
    }),
  ]);

  const deleted = await UserModel.deleteMany({ _id: { $in: studentIds } });
  console.log(`Purged ${deleted.deletedCount || 0} non-admin user account(s).`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Student purge failed.');
  process.exit(1);
});
