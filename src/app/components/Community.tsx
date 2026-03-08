import { useEffect, useMemo, useState } from 'react';
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
import { apiRequest } from '../lib/api';
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
}

interface MessageRow {
  id: string;
  connectionId: string;
  senderUserId: string;
  text: string;
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

function displayName(user: CommunityUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.username || 'Student';
}

export function Community() {
  const { token, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('discover-students');
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'weekly' | 'monthly'>('weekly');

  const [profile, setProfile] = useState<CommunityUser | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [shareProfilePicture, setShareProfilePicture] = useState(false);
  const [targetNetType, setTargetNetType] = useState('net-engineering');
  const [subjectsNeedHelpInput, setSubjectsNeedHelpInput] = useState('');
  const [preparationLevel, setPreparationLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate');
  const [studyTimePreference, setStudyTimePreference] = useState<'morning' | 'evening' | 'night' | 'flexible'>('flexible');
  const [scoreRangeMin, setScoreRangeMin] = useState(0);
  const [scoreRangeMax, setScoreRangeMax] = useState(200);
  const [bio, setBio] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<CommunityUser & { connectionStatus?: string }>>([]);
  const [profilePreview, setProfilePreview] = useState<CommunityUser | null>(null);

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

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState('');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [reportReason, setReportReason] = useState('');

  const activeConnection = useMemo(
    () => connections.find((item) => item.connectionId === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  const loadLeaderboardAndBadges = async (period: 'weekly' | 'monthly') => {
    if (!token) return;
    const [leaderboardPayload, badgesPayload] = await Promise.all([
      apiRequest<{ leaderboard: LeaderboardRow[] }>(`/api/community/leaderboard?period=${period}`, {}, token),
      apiRequest<{ badges: BadgeRow[] }>('/api/community/achievements', {}, token),
    ]);
    setLeaderboard(leaderboardPayload.leaderboard || []);
    setBadges(badgesPayload.badges || []);
  };

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
    setProfilePictureUrl(profilePayload.profile?.profilePictureUrl || '');
    setShareProfilePicture(Boolean(profilePayload.profile?.shareProfilePicture));
    setTargetNetType(profilePayload.profile?.targetNetType || 'net-engineering');
    setSubjectsNeedHelpInput((profilePayload.profile?.subjectsNeedHelp || []).join(', '));
    setPreparationLevel((profilePayload.profile?.preparationLevel as 'beginner' | 'intermediate' | 'advanced') || 'intermediate');
    setStudyTimePreference((profilePayload.profile?.studyTimePreference as 'morning' | 'evening' | 'night' | 'flexible') || 'flexible');
    setScoreRangeMin(Number(profilePayload.profile?.testScoreRange?.min ?? 0));
    setScoreRangeMax(Number(profilePayload.profile?.testScoreRange?.max ?? 200));
    setBio(profilePayload.profile?.bio || '');

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
            profilePictureUrl,
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
      toast.success('Community profile updated.');
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update profile.');
    }
  };

  const searchUsers = async () => {
    if (!token) return;
    try {
      const payload = await apiRequest<{ users: Array<CommunityUser & { connectionStatus?: string }> }>(
        `/api/community/users/search?q=${encodeURIComponent(searchQuery)}`,
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
    try {
      await apiRequest('/api/community/connections/request', {
        method: 'POST',
        body: JSON.stringify({ toUserId }),
      }, token);
      toast.success('Connection request sent.');
      await refreshCommunity();
      await searchUsers();
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

  const sendMessage = async () => {
    if (!token || !activeConnectionId) return;
    const text = messageInput.trim();
    if (!text) return;

    try {
      await apiRequest(`/api/community/messages/${activeConnectionId}`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, token);
      setMessageInput('');
      const payload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${activeConnectionId}`, {}, token);
      setMessages(payload.messages || []);
      await refreshCommunity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send message.');
    }
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

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto min-w-max gap-1">
            <TabsTrigger value="discover-students">Discover Students</TabsTrigger>
            <TabsTrigger value="study-partners">Study Partners</TabsTrigger>
            <TabsTrigger value="discussion-rooms">Discussion Rooms</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="discover-students" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Community Profile</CardTitle>
              <CardDescription>Set your NET goals and preferences so matching is productive.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Community Username</Label>
                  <Input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="e.g. future-engineer" />
                </div>
                <div className="space-y-1.5">
                  <Label>Profile Picture URL (optional)</Label>
                  <Input value={profilePictureUrl} onChange={(e) => setProfilePictureUrl(e.target.value)} placeholder="https://..." />
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

              <Button onClick={() => void saveCommunityProfile()}>Save Community Profile</Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle>Find Students</CardTitle>
                <CardDescription>Search users, send connection requests, and build your study network.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by username" />
                  <Button variant="outline" onClick={() => void searchUsers()}>Search</Button>
                </div>
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {searchResults.map((result) => (
                    <div key={result.id} className="rounded-lg border p-3">
                      <p className="text-sm">{displayName(result)}</p>
                      <p className="text-xs text-muted-foreground">{result.targetProgram || 'Program not set'}{result.city ? `  ${result.city}` : ''}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge variant="outline">{result.connectionStatus || 'none'}</Badge>
                        <div className="flex gap-1">
                          {result.connectionStatus === 'none' ? <Button size="sm" onClick={() => void sendConnectionRequest(result.id)}>Connect</Button> : null}
                          <Button size="sm" variant="outline" onClick={() => setProfilePreview(result)}>View profile</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!searchResults.length ? <p className="text-xs text-muted-foreground">Search to find study peers.</p> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
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
                        <p className="text-sm">{displayName(item.user)}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void respondToRequest(item.id, 'accept')}>Accept</Button>
                          <Button size="sm" variant="outline" onClick={() => void respondToRequest(item.id, 'reject')}>Reject</Button>
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
                        <p className="text-sm">{displayName(item.user)}</p>
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
                <CardTitle>{displayName(profilePreview)}</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle>Smart Study Partner Matching</CardTitle>
              <CardDescription>Find best-fit partners based on NET goals, level, timing, and score range.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[560px] overflow-auto">
              {studyPartners.map((item) => (
                <div key={item.user.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{displayName(item.user)}</p>
                      <p className="text-xs text-muted-foreground">{item.user.targetNetType || 'NET profile pending'}</p>
                      <p className="text-xs text-muted-foreground">Needs help: {(item.user.subjectsNeedHelp || []).join(', ') || 'Not set'}</p>
                      <p className="text-xs text-muted-foreground">Score: {Math.round(Number(item.user.score || 0))}  {item.user.studyTimePreference || 'flexible'} sessions</p>
                      {item.reasons?.length ? <p className="text-xs text-emerald-700 mt-1">{item.reasons.join(' | ')}</p> : null}
                    </div>
                    <Badge>{Math.round(item.compatibility)}% match</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => void sendConnectionRequest(item.user.id)}>Connect</Button>
                    <Button size="sm" variant="outline" onClick={() => setProfilePreview(item.user)}>View profile</Button>
                  </div>
                </div>
              ))}
              {!studyPartners.length ? <p className="text-xs text-muted-foreground">No study partners found yet.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discussion-rooms" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
            <Card>
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

            <Card>
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
                        <div className="flex gap-2">
                          <Input
                            value={answerTextByPostId[post.id] || ''}
                            onChange={(e) => setAnswerTextByPostId((prev) => ({ ...prev, [post.id]: e.target.value }))}
                            placeholder="Add answer"
                          />
                          <Button size="sm" onClick={() => void addAnswer(post.id)}>Reply</Button>
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
            <Card className="xl:col-span-1">
              <CardHeader>
                <CardTitle>Connected Students</CardTitle>
                <CardDescription>Choose a connection to open private chat.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-2">
                  <div className="space-y-2">
                    {connections.map((item) => (
                      <button
                        key={item.connectionId}
                        type="button"
                        onClick={() => setActiveConnectionId(item.connectionId)}
                        className={`w-full rounded-lg border p-3 text-left ${activeConnectionId === item.connectionId ? 'border-indigo-400 bg-indigo-50' : ''}`}
                      >
                        <p className="text-sm">{displayName(item.user)}</p>
                        <p className="text-xs text-muted-foreground">{item.user.targetProgram || 'Study partner'}</p>
                        {item.unreadCount > 0 ? <Badge className="mt-2">{item.unreadCount} unread</Badge> : null}
                      </button>
                    ))}
                    {!connections.length ? <p className="text-xs text-muted-foreground">No active connections yet.</p> : null}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Private Chat</CardTitle>
                <CardDescription>
                  {activeConnection ? `Chat with ${displayName(activeConnection.user)}` : 'Select a connection to start chatting.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="max-h-[330px] overflow-auto rounded-lg border p-3 space-y-2">
                  {messages.map((item) => (
                    <div key={item.id} className={`max-w-[85%] rounded-md p-2 text-sm ${item.senderUserId === user.id ? 'ml-auto bg-indigo-100 text-indigo-900' : 'bg-slate-100'}`}>
                      <p>{item.text}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</p>
                    </div>
                  ))}
                  {!messages.length ? <p className="text-xs text-muted-foreground">No messages yet.</p> : null}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={activeConnection ? 'Type a respectful message...' : 'Select connection first'}
                    disabled={!activeConnection}
                  />
                  <Button onClick={() => void sendMessage()} disabled={!activeConnection}>Send</Button>
                </div>
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
