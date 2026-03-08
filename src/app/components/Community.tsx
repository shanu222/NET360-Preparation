import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
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

function displayName(user: CommunityUser) {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.username || 'Student';
}

export function Community() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CommunityUser | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [shareProfilePicture, setShareProfilePicture] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<CommunityUser & { connectionStatus?: string }>>([]);
  const [incomingRequests, setIncomingRequests] = useState<CommunityRequestRow[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<CommunityRequestRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState('');
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [studyPartners, setStudyPartners] = useState<Array<{ compatibility: number; user: CommunityUser }>>([]);
  const [leaderboard, setLeaderboard] = useState<Array<{ rank: number } & CommunityUser>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; title: string; members: number; description: string }>>([]);

  const activeConnection = useMemo(
    () => connections.find((item) => item.connectionId === activeConnectionId) || null,
    [connections, activeConnectionId],
  );

  const refreshCommunity = async () => {
    if (!token) return;
    const [profilePayload, requestsPayload, connectionsPayload, leaderboardPayload, groupsPayload, partnersPayload] = await Promise.all([
      apiRequest<{ profile: CommunityUser }>('/api/community/profile', {}, token),
      apiRequest<{ incoming: CommunityRequestRow[]; outgoing: CommunityRequestRow[] }>('/api/community/connections/requests', {}, token),
      apiRequest<{ connections: ConnectionRow[] }>('/api/community/connections', {}, token),
      apiRequest<{ leaderboard: Array<{ rank: number } & CommunityUser> }>('/api/community/leaderboard', {}, token),
      apiRequest<{ groups: Array<{ id: string; title: string; members: number; description: string }> }>('/api/community/groups', {}, token),
      apiRequest<{ studyPartners: Array<{ compatibility: number; user: CommunityUser }> }>('/api/community/study-partners', {}, token),
    ]);

    setProfile(profilePayload.profile || null);
    setUsernameInput(profilePayload.profile?.username || '');
    setProfilePictureUrl(profilePayload.profile?.profilePictureUrl || '');
    setShareProfilePicture(Boolean(profilePayload.profile?.shareProfilePicture));
    setIncomingRequests(requestsPayload.incoming || []);
    setOutgoingRequests(requestsPayload.outgoing || []);
    setConnections(connectionsPayload.connections || []);
    setLeaderboard(leaderboardPayload.leaderboard || []);
    setGroups(groupsPayload.groups || []);
    setStudyPartners(partnersPayload.studyPartners || []);

    const nextConnectionId = activeConnectionId || (connectionsPayload.connections?.[0]?.connectionId || '');
    setActiveConnectionId(nextConnectionId);
    if (nextConnectionId) {
      const messagePayload = await apiRequest<{ messages: MessageRow[] }>(`/api/community/messages/${nextConnectionId}`, {}, token);
      setMessages(messagePayload.messages || []);
    } else {
      setMessages([]);
    }
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
      const payload = await apiRequest<{ profile: CommunityUser }>(
        '/api/community/profile',
        {
          method: 'PUT',
          body: JSON.stringify({
            username: usernameInput,
            profilePictureUrl,
            shareProfilePicture,
          }),
        },
        token,
      );
      setProfile(payload.profile);
      toast.success('Community profile updated.');
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
      <Card>
        <CardHeader>
          <CardTitle>Community Profile</CardTitle>
          <CardDescription>Control your visibility and how study partners find you.</CardDescription>
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
                  <p className="text-xs text-muted-foreground">{result.targetProgram || 'Program not set'}{result.city ? ` • ${result.city}` : ''}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant="outline">{result.connectionStatus || 'none'}</Badge>
                    {result.connectionStatus === 'none' ? (
                      <Button size="sm" onClick={() => void sendConnectionRequest(result.id)}>Connect</Button>
                    ) : null}
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

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Connected Students</CardTitle>
            <CardDescription>Choose a connection to open private chat.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[380px] pr-2">
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
            <div className="max-h-[290px] overflow-auto rounded-lg border p-3 space-y-2">
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
                  Submit Report
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Study Partner Matches</CardTitle>
            <CardDescription>Suggestions based on performance and weak-topic overlap.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-auto">
            {studyPartners.map((item) => (
              <div key={item.user.id} className="rounded-lg border p-3">
                <p className="text-sm">{displayName(item.user)}</p>
                <p className="text-xs text-muted-foreground">Compatibility: {Math.round(item.compatibility)}%</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subject Study Groups</CardTitle>
            <CardDescription>Curated collaboration rooms for NET aspirants.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-auto">
            {groups.map((group) => (
              <div key={group.id} className="rounded-lg border p-3">
                <p className="text-sm">{group.title}</p>
                <p className="text-xs text-muted-foreground">{group.members} members</p>
                <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>Top performers by average score and consistency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[280px] overflow-auto">
            {leaderboard.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm">#{entry.rank} {displayName(entry)}</p>
                  <p className="text-xs text-muted-foreground">{entry.targetProgram || 'NET Student'}</p>
                </div>
                <Badge variant="outline">{Math.round(Number(entry.score || 0))}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
