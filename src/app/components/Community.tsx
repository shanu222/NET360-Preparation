import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { apiRequest, buildApiUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface CommunityUser {
  id: string;
  firstName?: string;
  lastName?: string;
  targetProgram?: string;
  city?: string;
  score?: number;
  weakTopics?: string[];
  username?: string;
  shareProfilePicture?: boolean;
  profilePictureUrl?: string;
  favoriteSubjects?: string[];
  targetNetType?: string;
  subjectsNeedHelp?: string[];
  preparationLevel?: 'beginner' | 'intermediate' | 'advanced';
  studyTimePreference?: 'morning' | 'evening' | 'night' | 'flexible';
  testScoreRange?: { min: number; max: number };
  bio?: string;
  connectionStatus?: 'none' | 'connected' | 'pending-sent' | 'pending-received' | string;
}

interface CommunityRequestRow {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;
  createdAt: string | null;
  user: CommunityUser;
}

interface ConnectionRow {
  connectionId: string;
  connectedAt: string | null;
  user: CommunityUser;
  unreadCount: number;
  blockedByMe?: boolean;
  blockedByOther?: boolean;
  canMessage?: boolean;
}

interface MessageAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface MessageReaction {
  userId?: string;
  emoji: string;
  reactedAt: string | null;
}

interface MessageRow {
  id: string;
  connectionId: string;
  senderUserId: string;
  messageType?: 'text' | 'file' | 'voice' | 'call-invite' | string;
  text: string;
  attachment?: MessageAttachment | null;
  voiceMeta?: { durationSeconds: number } | null;
  callInvite?: { mode: 'audio' | 'video' | string; roomUrl: string; roomCode?: string } | null;
  reactions?: MessageReaction[];
  createdAt: string | null;
}

interface DiscussionRoom {
  id: string;
  title: string;
  subject: string;
  posts: number;
}

interface DiscussionPost {
  id: string;
  roomId: string;
  type: 'discussion' | 'doubt';
  title: string;
  text: string;
  subject: string;
  upvotes: number;
  createdAt: string | null;
  author: CommunityUser | null;
  answers: Array<{
    id: string;
    text: string;
    upvotes: number;
    createdAt: string | null;
    author: CommunityUser | null;
  }>;
}

interface BadgeRow {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
  progress: number;
  target: number;
}

interface LeaderboardRow extends CommunityUser {
  rank: number;
  averageScore: number;
  tests: number;
  accuracy: number;
  improvement: number;
}

interface QuizChallengeQuestion {
  questionId: string;
  subject: string;
  topic: string;
  question: string;
  options: string[];
  difficulty: string;
  correctAnswer?: string;
}

interface QuizChallengeResult {
  submitted: boolean;
  completedAt: string | null;
  elapsedSeconds: number;
  answers?: Array<{ questionId: string; selectedOption: string }>;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracyScore: number;
  speedScore: number;
  totalScore: number;
}

interface QuizLiveProgress {
  answeredCount: number;
  correctCount: number;
  elapsedSeconds: number;
  updatedAt: string | null;
}

interface QuizChallengeRow {
  id: string;
  challengerUserId: string;
  opponentUserId: string;
  mode: 'subject-wise' | 'mock' | 'adaptive' | 'custom' | string;
  challengeType?: 'async' | 'live' | string;
  subject: string;
  topic: string;
  difficulty: string;
  questionCount: number;
  durationSeconds: number;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled' | 'expired' | string;
  invitedAt: string | null;
  acceptedAt: string | null;
  acceptedDeadlineAt?: string | null;
  startedAt: string | null;
  endedAt: string | null;
  winnerUserId: string;
  isChallenger: boolean;
  myResult: QuizChallengeResult;
  opponentResult: QuizChallengeResult;
  myLiveProgress?: QuizLiveProgress;
  opponentLiveProgress?: QuizLiveProgress;
  questions: QuizChallengeQuestion[];
}

interface QuizLeaderboardRow {
  rank: number;
  userId: string;
  username?: string;
  name?: string;
  avatar?: string | null;
  totalWins: number;
  totalMatchesPlayed: number;
  winRate: number;
  totalChallengesSent: number;
  totalChallengesAccepted: number;
}

const PROFILE_PICTURE_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const PROFILE_PICTURE_MAX_BYTES = 3 * 1024 * 1024;
const CHAT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const QUICK_CHAT_EMOJIS = ['😀', '😂', '🔥', '👏', '❤️', '👍'];
const ENCRYPTION_LABEL = 'Messages are end-to-end encrypted.';

const CHAT_ATTACHMENT_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
].join(',');

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });
}

function createCallRoomUrl(connectionId: string) {
  const roomCode = `net360-${connectionId}-${Date.now()}`;
  return {
    roomCode,
    roomUrl: `https://meet.jit.si/${roomCode}`,
  };
}

function getAvatarFallback(userLike: { firstName?: string; lastName?: string; username?: string }) {
  const first = String(userLike.firstName || '').trim();
  const last = String(userLike.lastName || '').trim();
  const uname = String(userLike.username || '').trim();
  const label = [first, last].filter(Boolean).join(' ') || uname || 'U';
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

function CommunityAvatar({
  userLike,
  sizeClass = 'h-8 w-8',
}: {
  userLike: { firstName?: string; lastName?: string; username?: string; profilePictureUrl?: string };
  sizeClass?: string;
}) {
  const image = String(userLike.profilePictureUrl || '').trim();
  const fallback = getAvatarFallback(userLike);

  if (image) {
    return <img src={image} alt={fallback} className={`${sizeClass} rounded-full border object-cover`} />;
  }

  return (
    <div className={`${sizeClass} grid place-items-center rounded-full border bg-slate-100 text-[11px] font-medium text-slate-600`}>
      {fallback}
    </div>
  );
}

function displayName(user: CommunityUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.username || 'Student';
}

function canSendConnectionRequest(status?: string) {
  return !status || status === 'none';
}

export function Community() {
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('discover-students');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly' | 'monthly'>('weekly');

  const [profile, setProfile] = useState<CommunityUser | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [profilePictureDataUrl, setProfilePictureDataUrl] = useState('');
  const [profilePictureUploadName, setProfilePictureUploadName] = useState('');
  const [shareProfilePicture, setShareProfilePicture] = useState(false);
  const [targetNetType, setTargetNetType] = useState('net-engineering');
  const [subjectsNeedHelpInput, setSubjectsNeedHelpInput] = useState('');
  const [preparationLevel, setPreparationLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [studyTimePreference, setStudyTimePreference] = useState<'morning' | 'evening' | 'night' | 'flexible'>('flexible');
  const [scoreRangeMin, setScoreRangeMin] = useState(0);
  const [scoreRangeMax, setScoreRangeMax] = useState(200);
  const [bio, setBio] = useState('');
  const [isCommunityProfileExpanded, setIsCommunityProfileExpanded] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<CommunityUser & { connectionStatus?: string }>>([]);
  const [profilePreview, setProfilePreview] = useState<CommunityUser | null>(null);
  const [studyPartnersProfilePreview, setStudyPartnersProfilePreview] = useState<CommunityUser | null>(null);

  const [incomingRequests, setIncomingRequests] = useState<CommunityRequestRow[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<CommunityRequestRow[]>([]);

  const [studyPartners, setStudyPartners] = useState<Array<{ compatibility: number; user: CommunityUser; reasons?: string[] }>>([]);

  const [rooms, setRooms] = useState<DiscussionRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('');
  const [roomPosts, setRoomPosts] = useState<DiscussionPost[]>([]);
  const [newPostType, setNewPostType] = useState<'discussion' | 'doubt'>('discussion');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostText, setNewPostText] = useState('');
  const [answerTextByPostId, setAnswerTextByPostId] = useState<Record<string, string>>({});

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [badges, setBadges] = useState<BadgeRow[]>([]);

  const [quizChallenges, setQuizChallenges] = useState<QuizChallengeRow[]>([]);
  const [quizLeaderboard, setQuizLeaderboard] = useState<QuizLeaderboardRow[]>([]);
  const [selectedQuizChallengeId, setSelectedQuizChallengeId] = useState('');
  const [quizMode, setQuizMode] = useState<'subject-wise' | 'mock' | 'adaptive' | 'custom'>('subject-wise');
  const [quizSubject, setQuizSubject] = useState('mathematics');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizDifficulty, setQuizDifficulty] = useState('Medium');
  const [quizChallengeType, setQuizChallengeType] = useState<'async' | 'live'>('async');
  const [quizQuestionCount, setQuizQuestionCount] = useState(15);
  const [quizDurationSeconds, setQuizDurationSeconds] = useState(900);
  const [quizOpponentUserId, setQuizOpponentUserId] = useState('');
  const [allCommunityUsers, setAllCommunityUsers] = useState<Array<CommunityUser & { connectionStatus?: string }>>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizStartedAtMs, setQuizStartedAtMs] = useState<number | null>(null);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState('');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<MessageAttachment | null>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isBlockingConnection, setIsBlockingConnection] = useState(false);
  const [isUnfriendingConnection, setIsUnfriendingConnection] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const messageFileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceStartAtRef = useRef<number>(0);
  const hasInitializedChallengeNotifications = useRef(false);
  const previousChallengeState = useRef<Map<string, { status: string }>>(new Map());

  const activeConnection = useMemo(
    () => connections.find((item) => item.connectionId === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  const selectedQuizChallenge = useMemo(
    () => quizChallenges.find((item) => item.id === selectedQuizChallengeId) || null,
    [quizChallenges, selectedQuizChallengeId],
  );

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    allCommunityUsers.forEach((row) => map.set(String(row.id), displayName(row)));
    connections.forEach((row) => map.set(String(row.user.id), displayName(row.user)));
    incomingRequests.forEach((row) => map.set(String(row.user.id), displayName(row.user)));
    outgoingRequests.forEach((row) => map.set(String(row.user.id), displayName(row.user)));
    return map;
  }, [allCommunityUsers, connections, incomingRequests, outgoingRequests]);

  const hasCommunityProfileData = useMemo(() => {
    return Boolean(
      usernameInput.trim()
      || bio.trim()
      || subjectsNeedHelpInput.trim()
      || profilePictureDataUrl.trim(),
    );
  }, [usernameInput, bio, subjectsNeedHelpInput, profilePictureDataUrl]);

  const loadLeaderboardAndBadges = async (period: 'weekly' | 'monthly') => {
    if (!token) return;
    const [leaderboardPayload, badgesPayload] = await Promise.all([
      apiRequest<{ leaderboard: LeaderboardRow[] }>(`/api/community/leaderboard?period=${period}`, {}, token),
      apiRequest<{ badges: BadgeRow[] }>('/api/community/achievements', {}, token),
    ]);
    setLeaderboard(leaderboardPayload.leaderboard || []);
    setBadges(badgesPayload.badges || []);
  };

  const loadQuizData = async () => {
    if (!token) return;
    const [challengesPayload, quizBoardPayload] = await Promise.all([
      apiRequest<{ challenges: QuizChallengeRow[] }>('/api/community/quiz-challenges', {}, token),
      apiRequest<{ leaderboard: QuizLeaderboardRow[] }>('/api/community/quiz-leaderboard', {}, token),
    ]);

    const challengeRows = challengesPayload.challenges || [];
    setQuizChallenges(challengeRows);
    setQuizLeaderboard(quizBoardPayload.leaderboard || []);

    if (!selectedQuizChallengeId && challengeRows.length > 0) {
      setSelectedQuizChallengeId(challengeRows[0].id);
    } else if (selectedQuizChallengeId && !challengeRows.some((row) => row.id === selectedQuizChallengeId)) {
      setSelectedQuizChallengeId(challengeRows[0]?.id || '');
    }
  };

  const challengeRemainingSeconds = useMemo(() => {
    if (!selectedQuizChallenge || !quizStartedAtMs) return 0;
    const elapsed = Math.floor((Date.now() - quizStartedAtMs) / 1000);
    return Math.max(0, Number(selectedQuizChallenge.durationSeconds || 0) - elapsed);
  }, [selectedQuizChallenge, quizStartedAtMs]);

  const loadDiscussionRoomPosts = async (roomId: string) => {
    if (!token || !roomId) return;
    const payload = await apiRequest<{ room: DiscussionRoom; posts: DiscussionPost[] }>(`/api/community/discussion-rooms/${roomId}/posts`, {}, token);
    setRoomPosts(payload.posts || []);
  };

  const refreshCommunity = async () => {
    if (!token) return;

    const [
      profilePayload,
      requestsPayload,
      connectionsPayload,
      roomsPayload,
      partnersPayload,
    ] = await Promise.all([
      apiRequest<{ profile: CommunityUser }>('/api/community/profile', {}, token),
      apiRequest<{ incoming: CommunityRequestRow[]; outgoing: CommunityRequestRow[] }>('/api/community/connections/requests', {}, token),
      apiRequest<{ connections: ConnectionRow[] }>('/api/community/connections', {}, token),
      apiRequest<{ rooms: DiscussionRoom[] }>('/api/community/discussion-rooms', {}, token),
      apiRequest<{ studyPartners: Array<{ compatibility: number; user: CommunityUser; reasons?: string[] }> }>('/api/community/study-partners', {}, token),
    ]);

    setProfile(profilePayload.profile || null);
    setUsernameInput(profilePayload.profile?.username || '');
    setProfilePictureDataUrl(profilePayload.profile?.profilePictureUrl || '');
    setProfilePictureUploadName('');
    setShareProfilePicture(Boolean(profilePayload.profile?.shareProfilePicture));
    setTargetNetType(profilePayload.profile?.targetNetType || 'net-engineering');
    setSubjectsNeedHelpInput((profilePayload.profile?.subjectsNeedHelp || []).join(', '));
    setPreparationLevel((profilePayload.profile?.preparationLevel as 'beginner' | 'intermediate' | 'advanced') || 'intermediate');
    setStudyTimePreference((profilePayload.profile?.studyTimePreference as 'morning' | 'evening' | 'night' | 'flexible') || 'flexible');
    setScoreRangeMin(Number(profilePayload.profile?.testScoreRange?.min ?? 0));
    setScoreRangeMax(Number(profilePayload.profile?.testScoreRange?.max ?? 200));
    setBio(profilePayload.profile?.bio || '');
    setIsCommunityProfileExpanded(!(profilePayload.profile?.username || profilePayload.profile?.bio));

    setIncomingRequests(requestsPayload.incoming || []);
    setOutgoingRequests(requestsPayload.outgoing || []);
    setConnections(connectionsPayload.connections || []);
    setRooms(roomsPayload.rooms || []);
    setStudyPartners(partnersPayload.studyPartners || []);

    const nextRoomId = activeRoomId || (roomsPayload.rooms?.[0]?.id || '');
    setActiveRoomId(nextRoomId);
    if (nextRoomId) {
      await loadDiscussionRoomPosts(nextRoomId);
    } else {
      setRoomPosts([]);
    }

    const nextConnectionId = activeConnectionId || (connectionsPayload.connections?.[0]?.connectionId || '');
    setActiveConnectionId(nextConnectionId);
    if (nextConnectionId) {
      const messagePayload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${nextConnectionId}`, {}, token);
      setMessages(messagePayload.messages || []);
    } else {
      setMessages([]);
    }

    await loadLeaderboardAndBadges(leaderboardPeriod);
    await loadQuizData();

    const userSearchPayload = await apiRequest<{ users: Array<CommunityUser & { connectionStatus?: string }> }>(
      '/api/community/users/search?q=',
      {},
      token,
    );
    setAllCommunityUsers(userSearchPayload.users || []);
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      try {
        await refreshCommunity();
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load community data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void loadLeaderboardAndBadges(leaderboardPeriod);
  }, [token, leaderboardPeriod]);

  useEffect(() => {
    if (!token || !activeRoomId) {
      setRoomPosts([]);
      return;
    }
    void loadDiscussionRoomPosts(activeRoomId);
  }, [token, activeRoomId]);

  useEffect(() => {
    if (!token || !activeConnectionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    async function loadMessages() {
      try {
        const payload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${activeConnectionId}`, {}, token);
        if (!cancelled) setMessages(payload.messages || []);
      } catch {
        if (!cancelled) setMessages([]);
      }
    }
    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [token, activeConnectionId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let running = false;

    const poll = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const [requestsPayload, connectionsPayload, roomsPayload] = await Promise.all([
          apiRequest<{ incoming: CommunityRequestRow[]; outgoing: CommunityRequestRow[] }>('/api/community/connections/requests', {}, token),
          apiRequest<{ connections: ConnectionRow[] }>('/api/community/connections', {}, token),
          apiRequest<{ rooms: DiscussionRoom[] }>('/api/community/discussion-rooms', {}, token),
        ]);

        if (cancelled) return;
        setIncomingRequests(requestsPayload.incoming || []);
        setOutgoingRequests(requestsPayload.outgoing || []);
        setConnections(connectionsPayload.connections || []);
        setRooms(roomsPayload.rooms || []);

        if (activeConnectionId) {
          const messagePayload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${activeConnectionId}`, {}, token);
          if (!cancelled) setMessages(messagePayload.messages || []);
        }

        if (activeRoomId) {
          const roomPayload = await apiRequest<{ posts: DiscussionPost[] }>(`/api/community/discussion-rooms/${activeRoomId}/posts`, {}, token);
          if (!cancelled) setRoomPosts(roomPayload.posts || []);
        }

        if (activeTab === 'leaderboard') {
          await loadLeaderboardAndBadges(leaderboardPeriod);
        }
        if (activeTab === 'quiz-battles') {
          await loadQuizData();
        }
      } catch {
        // Silent polling failures; primary actions already show toasts.
      } finally {
        running = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [token, activeConnectionId, activeRoomId, activeTab, leaderboardPeriod]);

  useEffect(() => {
    return () => {
      if (voiceRecorderRef.current && voiceRecorderRef.current.state !== 'inactive') {
        voiceRecorderRef.current.stop();
      }
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;

    const closeCurrent = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (closed) return;
      closeCurrent();

      source = new EventSource(`${buildApiUrl('/api/stream')}?token=${encodeURIComponent(token)}`);
      source.addEventListener('sync', () => {
        if (document.hidden) return;
        void refreshCommunity().catch(() => undefined);
      });
      source.addEventListener('heartbeat', () => {
        // Stream heartbeat keeps transport alive.
      });
      source.onerror = () => {
        closeCurrent();
        if (closed) return;
        reconnectTimer = window.setTimeout(() => connect(), 3000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      closeCurrent();
    };
  }, [token]);

  useEffect(() => {
    const currentMap = new Map(quizChallenges.map((challenge) => [challenge.id, { status: String(challenge.status || '') }]));

    if (!hasInitializedChallengeNotifications.current) {
      previousChallengeState.current = currentMap;
      hasInitializedChallengeNotifications.current = true;
      return;
    }

    const previousMap = previousChallengeState.current;
    for (const challenge of quizChallenges) {
      const previous = previousMap.get(challenge.id);
      const opponentUserId = challenge.isChallenger ? challenge.opponentUserId : challenge.challengerUserId;
      const opponentName = userNameById.get(String(opponentUserId)) || 'Student';

      if (!previous && !challenge.isChallenger && challenge.status === 'pending' && challenge.challengeType === 'async') {
        toast.info(`New async challenge from ${opponentName}.`);
      }

      if (
        challenge.isChallenger
        && previous?.status === 'pending'
        && ['accepted', 'in_progress'].includes(String(challenge.status || ''))
      ) {
        toast.success(`${opponentName} accepted your challenge.`);
      }
    }

    previousChallengeState.current = currentMap;
  }, [quizChallenges, userNameById]);

  const syncLiveAnswerLock = async (questionId: string, selectedOption: string) => {
    if (!token || !selectedQuizChallenge || selectedQuizChallenge.challengeType !== 'live') return;
    if (!['accepted', 'in_progress'].includes(selectedQuizChallenge.status)) return;
    if (selectedQuizChallenge.myResult?.submitted) return;

    const elapsedSeconds = quizStartedAtMs ? Math.max(0, Math.floor((Date.now() - quizStartedAtMs) / 1000)) : 0;
    try {
      await apiRequest(`/api/community/quiz-challenges/${selectedQuizChallenge.id}/progress`, {
        method: 'POST',
        body: JSON.stringify({ questionId, selectedOption, elapsedSeconds }),
      }, token);
    } catch {
      // Keep quiz flow smooth even if transient sync fails.
    }
  };

  const onProfilePictureSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;

    const mimeType = String(selected.type || '').toLowerCase();
    if (!PROFILE_PICTURE_ALLOWED_MIME_TYPES.has(mimeType)) {
      toast.error('Profile picture format not supported. Use JPG, PNG, WEBP, GIF, or SVG.');
      event.currentTarget.value = '';
      return;
    }

    if (selected.size > PROFILE_PICTURE_MAX_BYTES) {
      toast.error('Profile picture exceeds 3MB limit.');
      event.currentTarget.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      setProfilePictureDataUrl(dataUrl);
      setProfilePictureUploadName(selected.name);
      toast.success('Profile picture selected. Save profile to apply.');
    } catch {
      toast.error('Could not read selected profile picture.');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const saveCommunityProfile = async () => {
    if (!token) return;
    try {
      const subjectsNeedHelp = subjectsNeedHelpInput
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);

      const payload = await apiRequest<{ profile: CommunityUser }>(
        '/api/community/profile',
        {
          method: 'PUT',
          body: JSON.stringify({
            username: usernameInput,
            profilePictureDataUrl,
            shareProfilePicture,
            targetNetType,
            subjectsNeedHelp,
            preparationLevel,
            studyTimePreference,
            testScoreRange: { min: scoreRangeMin, max: scoreRangeMax },
            bio,
          }),
        },
        token,
      );
      setProfile(payload.profile);
      setProfilePictureDataUrl(payload.profile?.profilePictureUrl || profilePictureDataUrl);
      setProfilePictureUploadName('');
      setIsCommunityProfileExpanded(false);
      toast.success('Community profile updated.');
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile.');
    }
  };

  const searchUsers = async (query = searchQuery) => {
    if (!token) return;
    try {
      const payload = await apiRequest<{ users: Array<CommunityUser & { connectionStatus?: string }> }>(
        `/api/community/users/search?q=${encodeURIComponent(query)}`,
        {},
        token,
      );
      setSearchResults(payload.users || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not search users.');
    }
  };

  const sendConnectionRequest = async (toUserId: string) => {
    if (!token) return;
    const status = [
      ...searchResults,
      ...studyPartners.map((item) => item.user),
      ...allCommunityUsers,
    ].find((row) => row.id === toUserId)?.connectionStatus;

    if (!canSendConnectionRequest(status)) {
      toast.info(status === 'connected' ? 'Already connected.' : 'Connection request already exists.');
      return;
    }

    try {
      await apiRequest('/api/community/connections/request', {
        method: 'POST',
        body: JSON.stringify({ toUserId }),
      }, token);
      toast.success('Connection request sent.');
      await refreshCommunity();
      await searchUsers(searchQuery);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send request.');
    }
  };

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    if (!token) return;
    try {
      await apiRequest(`/api/community/connections/requests/${requestId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }, token);
      toast.success(action === 'accept' ? 'Connection accepted.' : 'Request rejected.');
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update request.');
    }
  };

  const createRoomPost = async () => {
    if (!token || !activeRoomId) return;
    if (!newPostText.trim()) {
      toast.error('Write your discussion or doubt before posting.');
      return;
    }
    try {
      await apiRequest(`/api/community/discussion-rooms/${activeRoomId}/posts`, {
        method: 'POST',
        body: JSON.stringify({ type: newPostType, title: newPostTitle, text: newPostText }),
      }, token);
      setNewPostTitle('');
      setNewPostText('');
      toast.success('Posted to discussion room.');
      await loadDiscussionRoomPosts(activeRoomId);
      const roomsPayload = await apiRequest<{ rooms: DiscussionRoom[] }>('/api/community/discussion-rooms', {}, token);
      setRooms(roomsPayload.rooms || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post to room.');
    }
  };

  const addAnswer = async (postId: string) => {
    if (!token) return;
    const text = String(answerTextByPostId[postId] || '').trim();
    if (!text) return;
    try {
      await apiRequest(`/api/community/discussion-posts/${postId}/answers`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, token);
      setAnswerTextByPostId((prev) => ({ ...prev, [postId]: '' }));
      await loadDiscussionRoomPosts(activeRoomId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not post answer.');
    }
  };

  const upvoteDiscussion = async (postId: string, answerId?: string) => {
    if (!token) return;
    try {
      await apiRequest(`/api/community/discussion-posts/${postId}/upvote`, {
        method: 'POST',
        body: JSON.stringify({ targetType: answerId ? 'answer' : 'post', answerId: answerId || '' }),
      }, token);
      await loadDiscussionRoomPosts(activeRoomId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update vote.');
    }
  };

  const refreshActiveMessages = async () => {
    if (!token || !activeConnectionId) return;
    const payload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${activeConnectionId}`, {}, token);
    setMessages(payload.messages || []);
  };

  const sendCommunityMessage = async (payload: {
    messageType: 'text' | 'file' | 'voice' | 'call-invite';
    text?: string;
    attachment?: MessageAttachment | null;
    voiceMeta?: { durationSeconds: number };
    callInvite?: { mode: 'audio' | 'video'; roomUrl: string; roomCode: string };
  }) => {
    if (!token || !activeConnectionId || isSendingMessage) return;
    if (activeConnection && activeConnection.canMessage === false) {
      toast.error('Messaging is blocked for this connection until unblocked.');
      return;
    }

    try {
      setIsSendingMessage(true);
      await apiRequest(`/api/community/messages/${activeConnectionId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, token);
      setMessageInput('');
      setMessageAttachment(null);
      await refreshActiveMessages();
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const sendMessage = async () => {
    const text = messageInput.trim();
    if (!text) return;
    await sendCommunityMessage({ messageType: 'text', text });
  };

  const sendFileMessage = async () => {
    if (!messageAttachment) {
      toast.error('Select a file first.');
      return;
    }
    await sendCommunityMessage({ messageType: 'file', attachment: messageAttachment });
  };

  const onMessageFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;

    if (selected.size > CHAT_ATTACHMENT_MAX_BYTES) {
      toast.error('File exceeds 8MB size limit.');
      event.currentTarget.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      setMessageAttachment({
        name: selected.name,
        mimeType: String(selected.type || 'application/octet-stream').toLowerCase(),
        size: selected.size,
        dataUrl,
      });
      toast.success('File attached to chat.');
    } catch {
      toast.error('Could not read selected file.');
    } finally {
      event.currentTarget.value = '';
    }
  };

  const toggleMessageReaction = async (messageId: string, emoji: string) => {
    if (!token || !emoji) return;
    try {
      await apiRequest(`/api/community/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, token);
      await refreshActiveMessages();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update reaction.');
    }
  };

  const toggleBlockConnection = async () => {
    if (!token || !activeConnection) return;
    const nextBlockedState = !activeConnection.blockedByMe;
    try {
      setIsBlockingConnection(true);
      await apiRequest(`/api/community/connections/${activeConnection.connectionId}/block`, {
        method: 'POST',
        body: JSON.stringify({ blocked: nextBlockedState }),
      }, token);
      toast.success(nextBlockedState ? 'Connection blocked. Messaging paused.' : 'Connection unblocked. Messaging restored.');
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update block state.');
    } finally {
      setIsBlockingConnection(false);
    }
  };

  const unfriendConnection = async () => {
    if (!token || !activeConnection) return;
    const approved = window.confirm('Unfriend this connection? This will remove your shared chat history.');
    if (!approved) return;
    try {
      setIsUnfriendingConnection(true);
      await apiRequest(`/api/community/connections/${activeConnection.connectionId}/unfriend`, {
        method: 'POST',
      }, token);
      toast.success('Connection removed.');
      setActiveConnectionId('');
      setMessages([]);
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unfriend this connection.');
    } finally {
      setIsUnfriendingConnection(false);
    }
  };

  const sendCallInvite = async (mode: 'audio' | 'video') => {
    if (!activeConnection) return;
    const { roomCode, roomUrl } = createCallRoomUrl(activeConnection.connectionId);
    await sendCommunityMessage({
      messageType: 'call-invite',
      text: `${mode === 'audio' ? 'Audio' : 'Video'} call invitation`,
      callInvite: { mode, roomCode, roomUrl },
    });
  };

  const showComingSoonToastNearButton = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const toastWidth = 110;
    const top = Math.max(8, rect.top - 40);
    const left = Math.max(8, Math.min(window.innerWidth - toastWidth - 8, rect.left + rect.width / 2 - toastWidth / 2));

    toast.custom(() => (
      <div
        style={{
          position: 'fixed',
          top,
          left,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
        className="rounded-md border border-indigo-300 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
      >
        Coming Soon
      </div>
    ), {
      duration: 1400,
      dismissible: false,
    });
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error('Voice notes are not supported on this device/browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
        const dataUrl = await fileToDataUrl(file);
        const durationSeconds = Math.max(1, Math.floor((Date.now() - voiceStartAtRef.current) / 1000));
        await sendCommunityMessage({
          messageType: 'voice',
          attachment: {
            name: file.name,
            mimeType: file.type || 'audio/webm',
            size: file.size,
            dataUrl,
          },
          voiceMeta: { durationSeconds },
        });

        stream.getTracks().forEach((track) => track.stop());
        voiceRecorderRef.current = null;
        voiceStreamRef.current = null;
        setIsRecordingVoice(false);
      };

      voiceRecorderRef.current = recorder;
      voiceStreamRef.current = stream;
      voiceStartAtRef.current = Date.now();
      recorder.start();
      setIsRecordingVoice(true);
      toast.message('Recording voice note... tap Stop to send.');
    } catch {
      toast.error('Microphone permission denied or unavailable.');
    }
  };

  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
  };

  const reportConversation = async () => {
    if (!token || !activeConnection || !reportReason.trim()) return;
    try {
      await apiRequest('/api/community/report', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: activeConnection.connectionId,
          reportedUserId: activeConnection.user.id,
          reason: reportReason.trim(),
        }),
      }, token);
      setReportReason('');
      toast.success('Report submitted. Our moderation team will review this.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit report.');
    }
  };

  const createQuizChallenge = async () => {
    if (!token) return;
    if (!quizOpponentUserId) {
      toast.error('Select a student to challenge.');
      return;
    }
    try {
      await apiRequest('/api/community/quiz-challenges', {
        method: 'POST',
        body: JSON.stringify({
          opponentUserId: quizOpponentUserId,
          challengeType: quizChallengeType,
          mode: quizMode,
          subject: quizSubject,
          topic: quizTopic,
          difficulty: quizDifficulty,
          questionCount: quizQuestionCount,
          durationSeconds: quizDurationSeconds,
        }),
      }, token);
      toast.success('Quiz challenge sent.');
      setQuizAnswers({});
      setQuizStartedAtMs(null);
      await loadQuizData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create quiz challenge.');
    }
  };

  const respondQuizChallenge = async (challengeId: string, action: 'accept' | 'decline') => {
    if (!token) return;
    try {
      const payload = await apiRequest<{ challenge: QuizChallengeRow }>(`/api/community/quiz-challenges/${challengeId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }, token);
      if (action === 'accept') {
        openChallengeExamWindow(challengeId);
      }
      toast.success(action === 'accept' ? 'Challenge accepted.' : 'Challenge declined.');
      await loadQuizData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not respond to challenge.');
    }
  };

  const openChallengeExamWindow = (challengeId: string) => {
    if (!token) {
      toast.error('Please login first to launch a challenge test.');
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const examWindow = isNativeRuntime ? null : window.open('/exam-interface', '_blank', 'width=1400,height=900');

    if (!isNativeRuntime && !examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      return;
    }

    localStorage.setItem('net360-exam-launch', JSON.stringify({
      testType: 'challenge',
      challengeId,
      authToken: token,
      launchedAt: Date.now(),
    }));

    const url = `/exam-interface?testType=challenge&challengeId=${encodeURIComponent(challengeId)}&authToken=${encodeURIComponent(token)}`;
    if (isNativeRuntime) {
      window.location.href = url;
      return;
    }

    if (examWindow) {
      examWindow.location.href = url;
    }
  };

  const startChallengeAttempt = (challengeId: string) => {
    setSelectedQuizChallengeId(challengeId);
    openChallengeExamWindow(challengeId);
  };

  const submitQuizChallenge = async () => {
    if (!token || !selectedQuizChallenge) return;
    const answers = selectedQuizChallenge.questions.map((question) => ({
      questionId: question.questionId,
      selectedOption: String(quizAnswers[question.questionId] || '').trim(),
    }));
    const elapsedSeconds = quizStartedAtMs ? Math.max(0, Math.floor((Date.now() - quizStartedAtMs) / 1000)) : 0;

    try {
      await apiRequest(`/api/community/quiz-challenges/${selectedQuizChallenge.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers, elapsedSeconds }),
      }, token);
      toast.success('Challenge submitted.');
      setQuizStartedAtMs(null);
      setQuizAnswers({});
      await loadQuizData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit challenge.');
    }
  };

  if (!token || !user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Community</CardTitle>
          <CardDescription>Please sign in to access community features.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading community...</CardContent>
      </Card>
    );
  }

  const sectionTabTriggerClassName =
    'shrink-0 whitespace-nowrap rounded-xl border border-slate-200/90 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-[0_10px_20px_rgba(34,211,238,0.2)] active:scale-[0.98] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!via-violet-500 data-[state=active]:!to-fuchsia-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_14px_26px_rgba(109,40,217,0.34)]';
  const viewProfileButtonClassName =
    'border-cyan-300 bg-gradient-to-r from-white to-cyan-50 text-cyan-700 transition-all duration-250 ease-out hover:-translate-y-0.5 hover:scale-[1.03] hover:border-cyan-400 hover:from-cyan-50 hover:to-blue-50 hover:text-cyan-800 hover:shadow-[0_10px_16px_rgba(34,211,238,0.22)] active:scale-[0.98]';

  return (
    <div className="min-w-0 space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <div className="net360-horizontal-scroll net360-swipe-row -mx-1 px-1 pb-1 [scrollbar-gutter:stable]">
          <TabsList className="inline-flex h-auto w-max min-w-max flex-nowrap gap-2 rounded-2xl border border-slate-200 bg-gradient-to-r from-sky-50 via-indigo-50 to-fuchsia-50 p-1.5 shadow-[0_10px_20px_rgba(99,102,241,0.12)]">
            <TabsTrigger value="discover-students" className={sectionTabTriggerClassName}>Discover Students</TabsTrigger>
            <TabsTrigger value="study-partners" className={sectionTabTriggerClassName}>Study Partners</TabsTrigger>
            <TabsTrigger value="discussion-rooms" className={sectionTabTriggerClassName}>Discussion Rooms</TabsTrigger>
            <TabsTrigger value="quiz-battles" className={sectionTabTriggerClassName}>Quiz Battles</TabsTrigger>
            <TabsTrigger value="leaderboard" className={sectionTabTriggerClassName}>Leaderboard</TabsTrigger>
            <TabsTrigger value="messages" className={sectionTabTriggerClassName}>Messages</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="discover-students" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Community Profile</CardTitle>
                  <CardDescription>
                    {isCommunityProfileExpanded
                      ? 'Set your NET goals and preferences so matching is productive.'
                      : 'Saved profile summary. Use Edit Profile to update details.'}
                  </CardDescription>
                </div>
                {!isCommunityProfileExpanded ? (
                  <Button type="button" variant="outline" onClick={() => setIsCommunityProfileExpanded(true)}>
                    Edit Profile
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isCommunityProfileExpanded ? (
                <div className="grid gap-2 rounded-lg border bg-slate-50/70 p-3 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Username:</span> {usernameInput || 'Not set'}</p>
                  <p><span className="text-muted-foreground">Target NET:</span> {targetNetType || 'Not set'}</p>
                  <p><span className="text-muted-foreground">Help Subjects:</span> {subjectsNeedHelpInput || 'Not set'}</p>
                  <p><span className="text-muted-foreground">Preparation:</span> {preparationLevel}</p>
                  <p><span className="text-muted-foreground">Study Time:</span> {studyTimePreference}</p>
                  <p><span className="text-muted-foreground">Score Range:</span> {scoreRangeMin} - {scoreRangeMax}</p>
                  <p className="md:col-span-2"><span className="text-muted-foreground">Bio:</span> {bio || 'Not set'}</p>
                  <p className="md:col-span-2"><span className="text-muted-foreground">Profile Picture:</span> {hasCommunityProfileData && profilePictureDataUrl ? 'Added' : 'Not set'}</p>
                </div>
              ) : null}

              {isCommunityProfileExpanded ? (
                <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Community Username</Label>
                  <Input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="e.g. future-engineer" />
                </div>
                <div className="space-y-1.5">
                  <Label>Profile Picture Upload (optional)</Label>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,.svg,image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    onChange={(e) => void onProfilePictureSelected(e)}
                  />
                  {profilePictureUploadName ? <p className="text-xs text-muted-foreground">Selected: {profilePictureUploadName}</p> : null}
                  {profilePictureDataUrl ? (
                    <div className="flex items-center gap-3 rounded-md border p-2">
                      <img src={profilePictureDataUrl} alt="Profile preview" className="h-12 w-12 rounded-full border object-cover" />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setProfilePictureDataUrl('');
                          setProfilePictureUploadName('');
                        }}
                      >
                        Remove Picture
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Target NET Type</Label>
                  <Select value={targetNetType} onValueChange={setTargetNetType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="net-engineering">NET Engineering</SelectItem>
                      <SelectItem value="net-applied-sciences">NET Applied Sciences</SelectItem>
                      <SelectItem value="net-business-social-sciences">NET Business & Social Sciences</SelectItem>
                      <SelectItem value="net-architecture">NET Architecture</SelectItem>
                      <SelectItem value="net-natural-sciences">NET Natural Sciences</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subjects You Need Help In</Label>
                  <Input value={subjectsNeedHelpInput} onChange={(e) => setSubjectsNeedHelpInput(e.target.value)} placeholder="physics, mathematics" />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Preparation Level</Label>
                  <Select value={preparationLevel} onValueChange={(v) => setPreparationLevel(v as 'beginner' | 'intermediate' | 'advanced')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Study Time Preference</Label>
                  <Select value={studyTimePreference} onValueChange={(v) => setStudyTimePreference(v as 'morning' | 'evening' | 'night' | 'flexible')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="flexible">Flexible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Score Range</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min={0} max={200} value={scoreRangeMin} onChange={(e) => setScoreRangeMin(Number(e.target.value || 0))} />
                    <Input type="number" min={0} max={200} value={scoreRangeMax} onChange={(e) => setScoreRangeMax(Number(e.target.value || 200))} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Short Profile Bio</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-[70px]" />
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={shareProfilePicture} onCheckedChange={setShareProfilePicture} />
                <p className="text-sm text-muted-foreground">Allow other students to view my profile picture</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveCommunityProfile()}>Save Community Profile</Button>
                {hasCommunityProfileData ? (
                  <Button type="button" variant="outline" onClick={() => setIsCommunityProfileExpanded(false)}>
                    Cancel
                  </Button>
                ) : null}
              </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-1">
              <CardHeader>
                <CardTitle>Find Students</CardTitle>
                <CardDescription>Search users, send connection requests, and build your study network.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by username" />
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => void searchUsers()}>Search</Button>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {searchResults.map((result) => (
                    <div key={result.id} className="rounded-lg border p-3">
                      <div className="flex items-start gap-2">
                        <CommunityAvatar userLike={result} />
                        <div>
                          <p className="text-sm">{displayName(result)}</p>
                          <p className="text-xs text-muted-foreground">{result.targetProgram || 'Program not set'}{result.city ? `  ${result.city}` : ''}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline">{result.connectionStatus || 'none'}</Badge>
                        <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                          {canSendConnectionRequest(result.connectionStatus) ? (
                            <Button size="sm" className="w-full sm:w-auto" onClick={() => void sendConnectionRequest(result.id)}>Connect</Button>
                          ) : (
                            <Button size="sm" variant="secondary" className="w-full sm:w-auto" disabled>
                              {result.connectionStatus === 'connected'
                                ? 'Connected'
                                : result.connectionStatus === 'pending-received'
                                  ? 'Request Received'
                                  : 'Request Pending'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className={`${viewProfileButtonClassName} w-full sm:w-auto`}
                            onClick={() => setProfilePreview(result)}
                          >
                            View Profile
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!searchResults.length ? <p className="text-xs text-muted-foreground">Search to find study peers.</p> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-2">
              <CardHeader>
                <CardTitle>Connection Requests</CardTitle>
                <CardDescription>Accept genuine requests and reject unknown users.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm">Incoming</p>
                  <div className="space-y-2 max-h-[220px] overflow-auto">
                    {incomingRequests.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <CommunityAvatar userLike={item.user} />
                          <p className="text-sm">{displayName(item.user)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" className="w-full sm:w-auto" onClick={() => void respondToRequest(item.id, 'accept')}>Accept</Button>
                          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => void respondToRequest(item.id, 'reject')}>Reject</Button>
                        </div>
                      </div>
                    ))}
                    {!incomingRequests.length ? <p className="text-xs text-muted-foreground">No incoming requests.</p> : null}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm">Outgoing</p>
                  <div className="space-y-2 max-h-[220px] overflow-auto">
                    {outgoingRequests.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <CommunityAvatar userLike={item.user} />
                          <p className="text-sm">{displayName(item.user)}</p>
                        </div>
                        <Badge variant="outline" className="mt-2">Pending</Badge>
                      </div>
                    ))}
                    {!outgoingRequests.length ? <p className="text-xs text-muted-foreground">No outgoing requests.</p> : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {profilePreview ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CommunityAvatar userLike={profilePreview} />
                  <span>{displayName(profilePreview)}</span>
                </CardTitle>
                <CardDescription>Profile preview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Target NET: {profilePreview.targetNetType || '-'}</p>
                <p>Needs Help: {(profilePreview.subjectsNeedHelp || []).join(', ') || '-'}</p>
                <p>Level: {profilePreview.preparationLevel || '-'}</p>
                <p>Time: {profilePreview.studyTimePreference || '-'}</p>
                <p>Score: {Math.round(Number(profilePreview.score || 0))}</p>
                <Button size="sm" variant="outline" onClick={() => setProfilePreview(null)}>Close</Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="study-partners" className="mt-0 space-y-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Smart Study Partner Matching</CardTitle>
              <CardDescription>Find best-fit partners based on NET goals, level, timing, and score range.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[560px] overflow-auto">
              {studyPartners.map((item) => (
                <div key={item.user.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <CommunityAvatar userLike={item.user} />
                      <div>
                        <p className="text-sm font-medium">{displayName(item.user)}</p>
                        <p className="text-xs text-muted-foreground">{item.user.targetNetType || 'NET profile pending'}</p>
                        <p className="text-xs text-muted-foreground">Needs help: {(item.user.subjectsNeedHelp || []).join(', ') || 'Not set'}</p>
                        <p className="text-xs text-muted-foreground">Score: {Math.round(Number(item.user.score || 0))}  {item.user.studyTimePreference || 'flexible'} sessions</p>
                        {item.reasons?.length ? <p className="text-xs text-emerald-700 mt-1">{item.reasons.join(' | ')}</p> : null}
                      </div>
                    </div>
                    <Badge>{Math.round(item.compatibility)}% match</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canSendConnectionRequest(item.user.connectionStatus) ? (
                      <Button size="sm" className="w-full sm:w-auto" onClick={() => void sendConnectionRequest(item.user.id)}>Connect</Button>
                    ) : (
                      <Button size="sm" variant="secondary" className="w-full sm:w-auto" disabled>
                        {item.user.connectionStatus === 'connected'
                          ? 'Connected'
                          : item.user.connectionStatus === 'pending-received'
                            ? 'Request Received'
                            : 'Request Pending'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`${viewProfileButtonClassName} w-full sm:w-auto`}
                      onClick={() => setStudyPartnersProfilePreview(item.user)}
                    >
                      View Profile
                    </Button>
                  </div>
                </div>
              ))}
              {!studyPartners.length ? <p className="text-xs text-muted-foreground">No study partners found yet.</p> : null}
            </CardContent>
          </Card>

          {studyPartnersProfilePreview ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CommunityAvatar userLike={studyPartnersProfilePreview} />
                  <span>{displayName(studyPartnersProfilePreview)}</span>
                </CardTitle>
                <CardDescription>Profile preview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>Target NET: {studyPartnersProfilePreview.targetNetType || '-'}</p>
                <p>Needs Help: {(studyPartnersProfilePreview.subjectsNeedHelp || []).join(', ') || '-'}</p>
                <p>Level: {studyPartnersProfilePreview.preparationLevel || '-'}</p>
                <p>Time: {studyPartnersProfilePreview.studyTimePreference || '-'}</p>
                <p>Score: {Math.round(Number(studyPartnersProfilePreview.score || 0))}</p>
                <Button size="sm" variant="outline" onClick={() => setStudyPartnersProfilePreview(null)}>Close</Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="discussion-rooms" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Topic Discussion Rooms</CardTitle>
                <CardDescription>Join subject rooms and solve doubts together.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[560px] overflow-auto">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => setActiveRoomId(room.id)}
                    className={`w-full rounded-lg border p-3 text-left ${activeRoomId === room.id ? 'border-indigo-400 bg-indigo-50' : ''}`}
                  >
                    <p className="text-sm">{room.title}</p>
                    <p className="text-xs text-muted-foreground">{room.subject}  {room.posts} posts</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Room Feed</CardTitle>
                <CardDescription>Ask concepts, discuss MCQs, and use doubt exchange with upvotes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="grid gap-2 md:grid-cols-3">
                    <Select value={newPostType} onValueChange={(v) => setNewPostType(v as 'discussion' | 'doubt')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discussion">Discussion</SelectItem>
                        <SelectItem value="doubt">Doubt</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input value={newPostTitle} onChange={(e) => setNewPostTitle(e.target.value)} placeholder="Title (optional)" className="md:col-span-2" />
                  </div>
                  <Textarea value={newPostText} onChange={(e) => setNewPostText(e.target.value)} className="min-h-[90px]" placeholder="Share concept, MCQ, or doubt..." />
                  <Button onClick={() => void createRoomPost()} disabled={!activeRoomId}>Post in room</Button>
                </div>

                <div className="space-y-3 max-h-[560px] overflow-auto">
                  {roomPosts.map((post) => (
                    <div key={post.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{post.title || (post.type === 'doubt' ? 'Quick Doubt' : 'Discussion')}</p>
                        <Badge variant="outline">{post.type}</Badge>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{post.text}</p>
                      <p className="text-xs text-muted-foreground">By {post.author ? displayName(post.author) : 'Unknown'}  {post.createdAt ? new Date(post.createdAt).toLocaleString() : ''}</p>
                      <Button size="sm" variant="outline" onClick={() => void upvoteDiscussion(post.id)}>Upvote ({post.upvotes})</Button>

                      <div className="space-y-2 rounded-md bg-slate-50 p-2">
                        {post.answers.map((answer) => (
                          <div key={answer.id} className="rounded border bg-white p-2 text-sm">
                            <p>{answer.text}</p>
                            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{answer.author ? displayName(answer.author) : 'Unknown'}</span>
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => void upvoteDiscussion(post.id, answer.id)}>
                                Upvote ({answer.upvotes})
                              </Button>
                            </div>
                          </div>
                        ))}
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={answerTextByPostId[post.id] || ''}
                            onChange={(e) => setAnswerTextByPostId((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            placeholder="Add answer"
                          />
                          <Button size="sm" className="w-full sm:w-auto" onClick={() => void addAnswer(post.id)}>Reply</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!roomPosts.length ? <p className="text-xs text-muted-foreground">No discussions yet in this room.</p> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quiz-battles" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Create Quiz Challenge</CardTitle>
                <CardDescription>Challenge any student in async or live timed MCQ battle mode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Challenge Opponent</Label>
                  <Select value={quizOpponentUserId} onValueChange={setQuizOpponentUserId}>
                    <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                    <SelectContent>
                      {allCommunityUsers.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {displayName(item)}
                          {item.connectionStatus === 'connected' ? ' (connected)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Challenge Type</Label>
                  <Select value={quizChallengeType} onValueChange={(value) => setQuizChallengeType(value as 'async' | 'live')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="async">Async (offline/deferred)</SelectItem>
                      <SelectItem value="live">Live (simultaneous)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label>Mode</Label>
                    <Select value={quizMode} onValueChange={(value) => setQuizMode(value as 'subject-wise' | 'mock' | 'adaptive' | 'custom')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="subject-wise">Subject-wise</SelectItem>
                        <SelectItem value="mock">Mock Test</SelectItem>
                        <SelectItem value="adaptive">Adaptive Weak Areas</SelectItem>
                        <SelectItem value="custom">Custom Filters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Select value={quizSubject} onValueChange={setQuizSubject}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mathematics">Mathematics</SelectItem>
                        <SelectItem value="physics">Physics</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="biology">Biology</SelectItem>
                        <SelectItem value="chemistry">Chemistry</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Difficulty</Label>
                    <Select value={quizDifficulty} onValueChange={setQuizDifficulty}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Topic (for custom mode)</Label>
                  <Input value={quizTopic} onChange={(e) => setQuizTopic(e.target.value)} placeholder="e.g. trigonometry" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Questions</Label>
                    <Input
                      type="number"
                      min={5}
                      max={40}
                      value={quizQuestionCount}
                      onChange={(e) => setQuizQuestionCount(Number(e.target.value || 15))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration (sec)</Label>
                    <Input
                      type="number"
                      min={120}
                      max={3600}
                      value={quizDurationSeconds}
                      onChange={(e) => setQuizDurationSeconds(Number(e.target.value || 900))}
                    />
                  </div>
                </div>

                <Button onClick={() => void createQuizChallenge()} disabled={!allCommunityUsers.length}>Send Challenge</Button>
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Inbox & History</CardTitle>
                  <CardDescription>Accept invites, start attempts, and review outcomes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[280px] overflow-auto">
                  {quizChallenges.map((challenge) => {
                    const opponentUserId = challenge.isChallenger ? challenge.opponentUserId : challenge.challengerUserId;
                    const opponent = allCommunityUsers.find((row) => row.id === opponentUserId)
                      || connections.find((item) => item.user.id === opponentUserId)?.user;
                    return (
                      <button
                        key={challenge.id}
                        type="button"
                        onClick={() => setSelectedQuizChallengeId(challenge.id)}
                        className={`w-full rounded-lg border p-3 text-left ${selectedQuizChallengeId === challenge.id ? 'border-indigo-400 bg-indigo-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{challenge.mode} {challenge.subject ? ` ${challenge.subject}` : ''}</p>
                          <Badge variant="outline">{challenge.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {challenge.isChallenger ? 'vs' : 'from'} {opponent ? displayName(opponent) : 'Student'}  {challenge.questionCount} Q  {Math.round(challenge.durationSeconds / 60)} min  {challenge.challengeType || 'async'}
                        </p>
                        {challenge.status === 'pending' && !challenge.isChallenger ? (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); void respondQuizChallenge(challenge.id, 'accept'); }}>Accept</Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void respondQuizChallenge(challenge.id, 'decline'); }}>Decline</Button>
                          </div>
                        ) : null}
                        {(challenge.status === 'in_progress' || challenge.status === 'accepted') && !challenge.myResult.submitted ? (
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              startChallengeAttempt(challenge.id);
                            }}
                          >
                            Start Attempt
                          </Button>
                        ) : null}
                      </button>
                    );
                  })}
                  {!quizChallenges.length ? <p className="text-xs text-muted-foreground">No quiz challenges yet.</p> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Battle Arena</CardTitle>
                  <CardDescription>
                    {selectedQuizChallenge
                      ? `${selectedQuizChallenge.questionCount} questions | ${Math.round(selectedQuizChallenge.durationSeconds / 60)} minutes | ${selectedQuizChallenge.challengeType || 'async'}`
                      : 'Select a challenge to play.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedQuizChallenge ? (
                    <>
                      {(selectedQuizChallenge.status === 'in_progress' || selectedQuizChallenge.status === 'accepted') && !selectedQuizChallenge.myResult.submitted ? (
                        <>
                          <p className="text-xs text-muted-foreground">Challenge is active. Launching opens the secured exam interface.</p>
                          {selectedQuizChallenge.challengeType === 'live' ? (
                            <div className="rounded-md border bg-slate-50 p-2 text-xs text-muted-foreground">
                              <p>Your progress: {selectedQuizChallenge.myLiveProgress?.answeredCount || 0}/{selectedQuizChallenge.questionCount}</p>
                              <p>Opponent progress: {selectedQuizChallenge.opponentLiveProgress?.answeredCount || 0}/{selectedQuizChallenge.questionCount}</p>
                            </div>
                          ) : null}
                          <Button onClick={() => startChallengeAttempt(selectedQuizChallenge.id)}>Open Challenge Test Interface</Button>
                        </>
                      ) : (
                        <div className="space-y-2 rounded-md border p-3 text-sm">
                          <p>Status: {selectedQuizChallenge.status}</p>
                          <p>Your score: {selectedQuizChallenge.myResult.totalScore.toFixed(2)} ({selectedQuizChallenge.myResult.correctCount}/{selectedQuizChallenge.questionCount} correct)</p>
                          <p>Opponent score: {selectedQuizChallenge.opponentResult.totalScore.toFixed(2)}</p>
                          {selectedQuizChallenge.status === 'completed' ? (
                            <p className="font-medium">
                              {selectedQuizChallenge.winnerUserId
                                ? (selectedQuizChallenge.winnerUserId === user.id ? 'You won this battle.' : 'You lost this battle.')
                                : 'Battle ended in a tie.'}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Select a challenge from inbox/history.</p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Your Quiz Profile</CardTitle>
                    <CardDescription>Wins, matches, and performance trend.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>Total wins: {quizLeaderboard.find((row) => row.userId === user.id)?.totalWins || 0}</p>
                    <p>Total matches: {quizLeaderboard.find((row) => row.userId === user.id)?.totalMatchesPlayed || 0}</p>
                    <p>Win rate: {quizLeaderboard.find((row) => row.userId === user.id)?.winRate || 0}%</p>
                    <p>Challenges sent: {quizLeaderboard.find((row) => row.userId === user.id)?.totalChallengesSent || 0}</p>
                    <p>Challenges accepted: {quizLeaderboard.find((row) => row.userId === user.id)?.totalChallengesAccepted || 0}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quiz Battles Leaderboard</CardTitle>
                    <CardDescription>Top performers by wins, win rate, and volume.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 max-h-[220px] overflow-auto">
                    {quizLeaderboard.map((entry) => (
                      <div key={entry.userId} className="rounded-md border p-2 text-sm">
                        <p className="font-medium">#{entry.rank} {entry.name || entry.username || 'Student'}</p>
                        <p className="text-xs text-muted-foreground">Wins {entry.totalWins} | Matches {entry.totalMatchesPlayed} | Win Rate {entry.winRate}%</p>
                      </div>
                    ))}
                    {!quizLeaderboard.length ? <p className="text-xs text-muted-foreground">No quiz ranking data yet.</p> : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Competitive Leaderboard</CardTitle>
              <CardDescription>Weekly and monthly ranks from tests, accuracy, and improvement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Button size="sm" variant={leaderboardPeriod === 'weekly' ? 'default' : 'outline'} onClick={() => setLeaderboardPeriod('weekly')}>Weekly</Button>
                <Button size="sm" variant={leaderboardPeriod === 'monthly' ? 'default' : 'outline'} onClick={() => setLeaderboardPeriod('monthly')}>Monthly</Button>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-auto">
                {leaderboard.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm">#{entry.rank} {displayName(entry)}</p>
                      <p className="text-xs text-muted-foreground">Avg {entry.averageScore}  Acc {entry.accuracy}%  Improvement {entry.improvement}</p>
                    </div>
                    <Badge variant="outline">{Math.round(Number(entry.score || 0))}</Badge>
                  </div>
                ))}
                {!leaderboard.length ? <p className="text-xs text-muted-foreground">No ranking data yet.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Achievement Badges</CardTitle>
              <CardDescription>Gamified milestones for consistency and contribution.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {badges.map((badge) => (
                <div key={badge.id} className={`rounded-lg border p-3 ${badge.earned ? 'border-emerald-300 bg-emerald-50/60' : ''}`}>
                  <p className="text-sm">{badge.icon} {badge.label}</p>
                  <p className="text-xs text-muted-foreground">{badge.progress}/{badge.target}</p>
                  <Badge variant={badge.earned ? 'default' : 'outline'} className="mt-2">{badge.earned ? 'Unlocked' : 'Locked'}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-1">
              <CardHeader>
                <CardTitle>Connected Students</CardTitle>
                <CardDescription>Choose a connection to open private chat.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px] pr-2 sm:h-[500px]">
                  <div className="space-y-2">
                    {connections.map((item) => (
                      <button
                        key={item.connectionId}
                        type="button"
                        onClick={() => setActiveConnectionId(item.connectionId)}
                        className={`w-full rounded-lg border p-3 text-left ${activeConnectionId === item.connectionId ? 'border-indigo-400 bg-indigo-50' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <CommunityAvatar userLike={item.user} />
                          <div>
                            <p className="text-sm">{displayName(item.user)}</p>
                            <p className="text-xs text-muted-foreground">{item.user.targetProgram || 'Study partner'}</p>
                          </div>
                        </div>
                        {item.unreadCount > 0 ? <Badge className="mt-2">{item.unreadCount} unread</Badge> : null}
                      </button>
                    ))}
                    {!connections.length ? <p className="text-xs text-muted-foreground">No active connections yet.</p> : null}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-2">
              <CardHeader>
                <CardTitle>Private Chat</CardTitle>
                <CardDescription>
                  {activeConnection ? (
                    <span className="inline-flex items-center gap-2">
                      <CommunityAvatar userLike={activeConnection.user} sizeClass="h-6 w-6" />
                      {`Chat with ${displayName(activeConnection.user)}`}
                    </span>
                  ) : 'Select a connection to start chatting.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-800">
                  <span>{ENCRYPTION_LABEL}</span>
                  {activeConnection ? (
                    <div className="flex items-center gap-2">
                      {activeConnection.blockedByOther ? <Badge variant="outline">Blocked by user</Badge> : null}
                      {activeConnection.blockedByMe ? <Badge variant="outline">You blocked this user</Badge> : null}
                    </div>
                  ) : null}
                </div>

                {activeConnection ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={(event) => showComingSoonToastNearButton(event)} disabled={activeConnection.canMessage === false || isSendingMessage}>Audio Call</Button>
                    <Button type="button" size="sm" variant="outline" onClick={(event) => showComingSoonToastNearButton(event)} disabled={activeConnection.canMessage === false || isSendingMessage}>Video Call</Button>
                    <Button type="button" size="sm" variant="outline" onClick={(event) => showComingSoonToastNearButton(event)} disabled={activeConnection.canMessage === false || isSendingMessage}>Attach File</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => showComingSoonToastNearButton(event)}
                      disabled={activeConnection.canMessage === false || isSendingMessage}
                    >
                      {isRecordingVoice ? 'Stop Voice' : 'Voice Note'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void toggleBlockConnection()} disabled={isBlockingConnection || isSendingMessage}>
                      {isBlockingConnection ? 'Updating...' : activeConnection.blockedByMe ? 'Unblock' : 'Block'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void unfriendConnection()} disabled={isUnfriendingConnection || isSendingMessage}>
                      {isUnfriendingConnection ? 'Removing...' : 'Unfriend'}
                    </Button>
                    <input
                      ref={messageFileInputRef}
                      type="file"
                      accept={CHAT_ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => void onMessageFileSelected(e)}
                    />
                  </div>
                ) : null}

                {messageAttachment ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-medium">Ready to send: {messageAttachment.name}</p>
                    <p className="text-muted-foreground">{Math.max(1, Math.round(messageAttachment.size / 1024))} KB</p>
                    <div className="mt-2 flex gap-2">
                      <Button type="button" size="sm" onClick={() => void sendFileMessage()} disabled={!activeConnection || activeConnection.canMessage === false || isSendingMessage}>Send File</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setMessageAttachment(null)}>Remove</Button>
                    </div>
                  </div>
                ) : null}

                <div className="max-h-[300px] overflow-auto rounded-lg border p-3 space-y-2 sm:max-h-[330px]">
                  {messages.map((item) => (
                    <div key={item.id} className={`max-w-[88%] rounded-md p-2 text-sm ${item.senderUserId === user.id ? 'ml-auto bg-indigo-100 text-indigo-900 dark:bg-indigo-500/30 dark:text-indigo-100' : 'bg-slate-100 text-slate-800 dark:bg-slate-800/85 dark:text-slate-100'}`}>
                      {item.messageType === 'call-invite' && item.callInvite?.roomUrl ? (
                        <div className="space-y-1">
                          <p>{item.text || `${item.callInvite.mode === 'video' ? 'Video' : 'Audio'} call invite`}</p>
                          <a href={item.callInvite.roomUrl} target="_blank" rel="noreferrer" className="text-xs underline underline-offset-2">
                            Join {item.callInvite.mode === 'video' ? 'Video' : 'Audio'} Call
                          </a>
                        </div>
                      ) : null}
                      {item.messageType === 'file' && item.attachment ? (
                        <div className="space-y-1">
                          <p>{item.text || 'Shared a file'}</p>
                          <a href={item.attachment.dataUrl} download={item.attachment.name} className="text-xs underline underline-offset-2">{item.attachment.name}</a>
                        </div>
                      ) : null}
                      {item.messageType === 'voice' && item.attachment ? (
                        <div className="space-y-1">
                          <p>{item.text || `Voice note (${item.voiceMeta?.durationSeconds || 0}s)`}</p>
                          <audio controls src={item.attachment.dataUrl} className="w-full" />
                        </div>
                      ) : null}
                      {(!item.messageType || item.messageType === 'text') && item.text ? <p>{item.text}</p> : null}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {QUICK_CHAT_EMOJIS.map((emoji) => (
                          <button
                            key={`${item.id}-${emoji}`}
                            type="button"
                            className="rounded border bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-800 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
                            onClick={() => void toggleMessageReaction(item.id, emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      {Array.isArray(item.reactions) && item.reactions.length ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">{item.reactions.map((reaction) => reaction.emoji).join(' ')}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                    </div>
                  ))}
                  {!messages.length ? <p className="text-xs text-muted-foreground">No messages yet.</p> : null}
                </div>
                <form
                  className="flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMessage();
                  }}
                >
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={activeConnection ? 'Type a respectful message...' : 'Select connection first'}
                    disabled={!activeConnection || isSendingMessage || activeConnection.canMessage === false}
                  />
                  <Button type="submit" className="w-full sm:w-auto" disabled={!activeConnection || isSendingMessage || !messageInput.trim() || activeConnection.canMessage === false}>
                    {isSendingMessage ? 'Sending...' : 'Send'}
                  </Button>
                </form>
                {activeConnection ? (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <Label>Report this conversation (safety)</Label>
                    <Textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="min-h-[80px]"
                      placeholder="Share what happened. Harmful users are auto-restricted and reviewed by admin."
                    />
                    <Button variant="outline" onClick={() => void reportConversation()} disabled={!reportReason.trim()}>
                      Submit report
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
