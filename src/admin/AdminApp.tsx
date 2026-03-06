import { useEffect, useMemo, useState } from 'react';
import { apiRequest, resolveApiUrl } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../app/components/ui/tabs';
import { Textarea } from '../app/components/ui/textarea';
import { Badge } from '../app/components/ui/badge';
import { Toaster } from 'sonner';
import { toast } from 'sonner';

const SUBJECTS = ['mathematics', 'physics', 'english', 'biology', 'chemistry'] as const;
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

type Subject = (typeof SUBJECTS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  blocked: boolean;
  attemptsCount: number;
  activeSession: { id: string; deviceId: string; lastSeenAt: string } | null;
}

interface SignupRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  paymentReference: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
  reviewedAt: string | null;
  notes?: string;
}

interface AdminIdentity {
  id: string;
  email: string;
  name: string;
}

interface Mcq {
  id: string;
  subject: Subject;
  topic: string;
  question: string;
  options: string[];
  answer: string;
  tip: string;
  difficulty: Difficulty;
  updatedAt: string;
}

function emptyMcqForm() {
  return {
    id: '',
    subject: 'mathematics' as Subject,
    topic: 'General',
    question: '',
    optionsText: '',
    answer: '',
    tip: '',
    difficulty: 'Easy' as Difficulty,
  };
}

export default function AdminApp() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authForm, setAuthForm] = useState({ email: 'admin@net360.local', password: '' });

  const [overview, setOverview] = useState({
    usersTotal: 0,
    activeUsers: 0,
    blockedUsers: 0,
    pendingSignupRequests: 0,
    mcqTotal: 0,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [mcqs, setMcqs] = useState<Mcq[]>([]);
  const [issuedCodes, setIssuedCodes] = useState<Record<string, string>>({});

  const [mcqFilter, setMcqFilter] = useState({ subject: 'all', difficulty: 'all', topic: '' });
  const [mcqForm, setMcqForm] = useState(emptyMcqForm());

  const activeUsers = useMemo(() => users.filter((user) => user.activeSession).length, [users]);

  async function loadAdminData() {
    const [overviewPayload, usersPayload, requestsPayload, mcqPayload] = await Promise.all([
      apiRequest<typeof overview>('/api/admin/overview'),
      apiRequest<{ users: AdminUser[] }>('/api/admin/users'),
      apiRequest<{ requests: SignupRequest[] }>('/api/admin/signup-requests?status=all'),
      apiRequest<{ mcqs: Mcq[] }>('/api/admin/mcqs'),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setRequests(requestsPayload.requests || []);
    setMcqs(mcqPayload.mcqs || []);
  }

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const payload = await apiRequest<{ admin: AdminIdentity }>('/api/admin/auth/me');
        if (!cancelled) {
          setAdmin(payload.admin);
        }
      } catch {
        if (!cancelled) {
          setAdmin(null);
        }
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!admin) return;

    let cancelled = false;

    async function sync() {
      try {
        await loadAdminData();
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Failed to load admin data.');
        }
      }
    }

    void sync();

    const streamUrl = resolveApiUrl('/api/admin/events');
    const stream = new EventSource(streamUrl, { withCredentials: true });
    const handleServerEvent = () => {
      void sync();
    };

    stream.addEventListener('mcqs.updated', handleServerEvent);
    stream.addEventListener('users.updated', handleServerEvent);
    stream.addEventListener('signup.updated', handleServerEvent);
    stream.addEventListener('tests.updated', handleServerEvent);

    return () => {
      cancelled = true;
      stream.removeEventListener('mcqs.updated', handleServerEvent);
      stream.removeEventListener('users.updated', handleServerEvent);
      stream.removeEventListener('signup.updated', handleServerEvent);
      stream.removeEventListener('tests.updated', handleServerEvent);
      stream.close();
    };
  }, [admin]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await apiRequest<{ token: string }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });
      const mePayload = await apiRequest<{ admin: AdminIdentity }>('/api/admin/auth/me');
      setAdmin(mePayload.admin);
      toast.success('Admin login successful.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    void apiRequest('/api/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAdmin(null);
  };

  const toggleBlock = async (user: AdminUser, blocked: boolean) => {
    if (!admin) return;
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ blocked }),
      });
      toast.success(blocked ? 'User blocked.' : 'User unblocked.');
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed.');
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!admin) return;
    if (!window.confirm(`Remove user ${user.email}? This also removes attempts and sessions.`)) return;

    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      toast.success('User removed.');
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed.');
    }
  };

  const approveRequest = async (request: SignupRequest) => {
    if (!admin) return;
    try {
      const payload = await apiRequest<{ token: { code: string } }>(
        `/api/admin/signup-requests/${request.id}/approve`,
        { method: 'POST', body: JSON.stringify({ expiresInDays: 7 }) },
      );
      setIssuedCodes((prev) => ({ ...prev, [request.id]: payload.token.code }));
      toast.success(`Approved. Token generated: ${payload.token.code}`);
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Approval failed.');
    }
  };

  const rejectRequest = async (request: SignupRequest) => {
    if (!admin) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Payment verification failed.' }),
      });
      toast.success('Request rejected.');
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reject failed.');
    }
  };

  const saveMcq = async () => {
    if (!admin) return;

    const options = mcqForm.optionsText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    const payload = {
      subject: mcqForm.subject,
      topic: mcqForm.topic,
      question: mcqForm.question,
      options,
      answer: mcqForm.answer,
      tip: mcqForm.tip,
      difficulty: mcqForm.difficulty,
    };

    try {
      if (mcqForm.id) {
        await apiRequest(`/api/admin/mcqs/${mcqForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('MCQ updated.');
      } else {
        await apiRequest('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('MCQ added.');
      }

      setMcqForm(emptyMcqForm());
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'MCQ save failed.');
    }
  };

  const editMcq = (mcq: Mcq) => {
    setMcqForm({
      id: mcq.id,
      subject: mcq.subject,
      topic: mcq.topic,
      question: mcq.question,
      optionsText: mcq.options.join('\n'),
      answer: mcq.answer,
      tip: mcq.tip,
      difficulty: mcq.difficulty,
    });
  };

  const deleteMcq = async (mcq: Mcq) => {
    if (!admin) return;
    if (!window.confirm('Delete this MCQ?')) return;

    try {
      await apiRequest(`/api/admin/mcqs/${mcq.id}`, { method: 'DELETE' });
      toast.success('MCQ removed.');
      await loadAdminData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed.');
    }
  };

  const filteredMcqs = mcqs.filter((mcq) => {
    if (mcqFilter.subject !== 'all' && mcq.subject !== mcqFilter.subject) return false;
    if (mcqFilter.difficulty !== 'all' && mcq.difficulty !== mcqFilter.difficulty) return false;
    if (mcqFilter.topic && !mcq.topic.toLowerCase().includes(mcqFilter.topic.toLowerCase())) return false;
    return true;
  });

  if (authChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Checking admin session...</p>
          </CardContent>
        </Card>
        <Toaster richColors position="top-right" />
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>NET360 Admin Panel</CardTitle>
            <CardDescription>Separate control center for content, users, and signup approvals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? 'Logging in...' : 'Login as Admin'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Cookie-only session enabled. Default dev admin: admin@net360.local / admin123456
            </p>
          </CardContent>
        </Card>
        <Toaster richColors position="top-right" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl">NET360 Admin Panel</h1>
            <p className="text-sm text-muted-foreground">{admin.email} | Live control for MCQs, users, and signup tokens</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>Logout</Button>
        </div>
      </header>

      <main className="container px-4 py-6 space-y-6">
        <div className="grid md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl">{overview.usersTotal}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Active/Live</p>
              <p className="text-2xl">{overview.activeUsers || activeUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Blocked</p>
              <p className="text-2xl">{overview.blockedUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Pending Signups</p>
              <p className="text-2xl">{overview.pendingSignupRequests}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total MCQs</p>
              <p className="text-2xl">{overview.mcqTotal}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="signup" className="space-y-4">
          <TabsList>
            <TabsTrigger value="signup">Signup Requests</TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="mcqs">Manage MCQs</TabsTrigger>
          </TabsList>

          <TabsContent value="signup" className="space-y-4">
            {requests.length === 0 ? <p className="text-muted-foreground">No signup requests.</p> : null}
            {requests.map((request) => (
              <Card key={request.id}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{request.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Payment Ref: {request.paymentReference || 'N/A'}
                      </p>
                    </div>
                    <Badge>{request.status}</Badge>
                  </div>
                  {(request.firstName || request.lastName) ? (
                    <p className="text-sm">Name: {[request.firstName, request.lastName].filter(Boolean).join(' ')}</p>
                  ) : null}
                  {issuedCodes[request.id] ? (
                    <p className="text-sm">
                      Generated Token: <code>{issuedCodes[request.id]}</code>
                    </p>
                  ) : null}
                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void approveRequest(request)}>Approve & Generate Token</Button>
                      <Button size="sm" variant="outline" onClick={() => void rejectRequest(request)}>Reject</Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            {users.map((user) => (
              <Card key={user.id}>
                <CardContent className="pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-medium">{user.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.firstName} {user.lastName} | Attempts: {user.attemptsCount}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.activeSession
                        ? `Live on ${user.activeSession.deviceId} (last seen ${new Date(user.activeSession.lastSeenAt).toLocaleString()})`
                        : 'Offline'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {user.blocked ? (
                      <Button size="sm" variant="outline" onClick={() => void toggleBlock(user, false)}>Unblock</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void toggleBlock(user, true)}>Block</Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => void deleteUser(user)}>Remove</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="mcqs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{mcqForm.id ? 'Edit MCQ' : 'Add MCQ'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Select value={mcqForm.subject} onValueChange={(value) => setMcqForm((prev) => ({ ...prev, subject: value as Subject }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((subject) => (
                          <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Difficulty</Label>
                    <Select value={mcqForm.difficulty} onValueChange={(value) => setMcqForm((prev) => ({ ...prev, difficulty: value as Difficulty }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIFFICULTIES.map((difficulty) => (
                          <SelectItem key={difficulty} value={difficulty}>{difficulty}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Topic</Label>
                  <Input value={mcqForm.topic} onChange={(e) => setMcqForm((prev) => ({ ...prev, topic: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label>Question</Label>
                  <Textarea value={mcqForm.question} onChange={(e) => setMcqForm((prev) => ({ ...prev, question: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label>Options (one per line)</Label>
                  <Textarea value={mcqForm.optionsText} onChange={(e) => setMcqForm((prev) => ({ ...prev, optionsText: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label>Answer</Label>
                  <Input value={mcqForm.answer} onChange={(e) => setMcqForm((prev) => ({ ...prev, answer: e.target.value }))} />
                </div>

                <div className="space-y-2">
                  <Label>Tip</Label>
                  <Input value={mcqForm.tip} onChange={(e) => setMcqForm((prev) => ({ ...prev, tip: e.target.value }))} />
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => void saveMcq()}>{mcqForm.id ? 'Update MCQ' : 'Add MCQ'}</Button>
                  {mcqForm.id ? (
                    <Button variant="outline" onClick={() => setMcqForm(emptyMcqForm())}>Cancel Edit</Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MCQ List</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                  <Select value={mcqFilter.subject} onValueChange={(value) => setMcqFilter((prev) => ({ ...prev, subject: value }))}>
                    <SelectTrigger><SelectValue placeholder="All Subjects" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {SUBJECTS.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={mcqFilter.difficulty} onValueChange={(value) => setMcqFilter((prev) => ({ ...prev, difficulty: value }))}>
                    <SelectTrigger><SelectValue placeholder="All Difficulties" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Difficulties</SelectItem>
                      {DIFFICULTIES.map((difficulty) => (
                        <SelectItem key={difficulty} value={difficulty}>{difficulty}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Filter by topic"
                    value={mcqFilter.topic}
                    onChange={(e) => setMcqFilter((prev) => ({ ...prev, topic: e.target.value }))}
                  />
                </div>

                <div className="space-y-2 max-h-[600px] overflow-auto">
                  {filteredMcqs.map((mcq) => (
                    <div key={mcq.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge>{mcq.subject}</Badge>
                          <Badge variant="outline">{mcq.difficulty}</Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => editMcq(mcq)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => void deleteMcq(mcq)}>Delete</Button>
                        </div>
                      </div>
                      <p className="font-medium">{mcq.question}</p>
                      <p className="text-sm text-muted-foreground">Topic: {mcq.topic}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
