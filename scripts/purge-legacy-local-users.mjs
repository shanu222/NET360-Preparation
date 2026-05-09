import { connectMongo } from '../server/lib/mongo.js';
import { UserModel } from '../server/models/User.js';
import { AttemptModel } from '../server/models/Attempt.js';
import { TestSessionModel } from '../server/models/TestSession.js';
import { AIUsageModel } from '../server/models/AIUsage.js';
import { PasswordRecoveryRequestModel } from '../server/models/PasswordRecoveryRequest.js';
import { SignupRequestModel } from '../server/models/SignupRequest.js';
import { SignupTokenModel } from '../server/models/SignupToken.js';
import { PremiumSubscriptionRequestModel } from '../server/models/PremiumSubscriptionRequest.js';
import { PremiumActivationTokenModel } from '../server/models/PremiumActivationToken.js';
import { QuestionSubmissionModel } from '../server/models/QuestionSubmission.js';
import { SupportChatMessageModel } from '../server/models/SupportChatMessage.js';
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

  const legacyUsers = await UserModel.find({
    role: { $ne: 'admin' },
    $or: [
      { authProvider: { $exists: false } },
      { authProvider: 'local' },
    ],
  }).select('_id email');

  const legacyUserIds = legacyUsers.map((item) => item._id);

  await Promise.all([
    AttemptModel.deleteMany(legacyUserIds.length ? { userId: { $in: legacyUserIds } } : {}),
    TestSessionModel.deleteMany(legacyUserIds.length ? { userId: { $in: legacyUserIds } } : {}),
    AIUsageModel.deleteMany(legacyUserIds.length ? { userId: { $in: legacyUserIds } } : {}),
    // Remove old manual workflow queues and requests.
    PasswordRecoveryRequestModel.deleteMany({}),
    SignupRequestModel.deleteMany({}),
    SignupTokenModel.deleteMany({}),
    PremiumSubscriptionRequestModel.deleteMany({}),
    PremiumActivationTokenModel.deleteMany({}),
    QuestionSubmissionModel.deleteMany({}),
    SupportChatMessageModel.deleteMany({}),
    CommunityProfileModel.deleteMany(legacyUserIds.length ? { userId: { $in: legacyUserIds } } : {}),
    CommunityConnectionRequestModel.deleteMany({
      $or: [
        { fromUserId: { $in: legacyUserIds } },
        { toUserId: { $in: legacyUserIds } },
      ],
    }),
    CommunityConnectionModel.deleteMany({
      $or: [
        { participantA: { $in: legacyUserIds } },
        { participantB: { $in: legacyUserIds } },
      ],
    }),
    CommunityMessageModel.deleteMany({ senderUserId: { $in: legacyUserIds } }),
    CommunityReportModel.deleteMany({
      $or: [
        { reporterUserId: { $in: legacyUserIds } },
        { reportedUserId: { $in: legacyUserIds } },
      ],
    }),
    CommunityBlockModel.deleteMany({ userId: { $in: legacyUserIds } }),
    CommunityRoomPostModel.deleteMany({ authorUserId: { $in: legacyUserIds } }),
    CommunityQuizChallengeModel.deleteMany({
      $or: [
        { challengerUserId: { $in: legacyUserIds } },
        { opponentUserId: { $in: legacyUserIds } },
      ],
    }),
  ]);

  let deletedUsers = 0;
  if (legacyUserIds.length) {
    const deleted = await UserModel.deleteMany({ _id: { $in: legacyUserIds } });
    deletedUsers = Number(deleted.deletedCount || 0);
  }

  console.log(`Purged ${deletedUsers} legacy local user account(s) and reset old request queues.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Legacy user purge failed.');
  process.exit(1);
});
