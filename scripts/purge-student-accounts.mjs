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

  const students = await UserModel.find({ role: { $ne: 'admin' } }).select('_id email');
  const studentIds = students.map((item) => item._id);

  await Promise.all([
    AttemptModel.deleteMany(studentIds.length ? { userId: { $in: studentIds } } : {}),
    TestSessionModel.deleteMany(studentIds.length ? { userId: { $in: studentIds } } : {}),
    AIUsageModel.deleteMany(studentIds.length ? { userId: { $in: studentIds } } : {}),
    // Clean all admin-facing request queues so panel starts from zero.
    PasswordRecoveryRequestModel.deleteMany({}),
    SignupRequestModel.deleteMany({}),
    SignupTokenModel.deleteMany({}),
    PremiumSubscriptionRequestModel.deleteMany({}),
    PremiumActivationTokenModel.deleteMany({}),
    QuestionSubmissionModel.deleteMany({}),
    SupportChatMessageModel.deleteMany({}),
    CommunityProfileModel.deleteMany(studentIds.length ? { userId: { $in: studentIds } } : {}),
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

  let deletedUsers = 0;
  if (studentIds.length) {
    const deleted = await UserModel.deleteMany({ _id: { $in: studentIds } });
    deletedUsers = Number(deleted.deletedCount || 0);
  }
  console.log(`Purged ${deletedUsers} non-admin user account(s) and reset request queues.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Student purge failed.');
  process.exit(1);
});
