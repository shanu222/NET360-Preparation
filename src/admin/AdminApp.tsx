import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../app/components/ui/tabs';
import { Badge } from '../app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Textarea } from '../app/components/ui/textarea';
import { toast } from 'sonner';

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'admin';
  createdAt: string | null;
}

interface AdminOverview {
  usersCount: number;
  mcqCount: number;
  attemptsCount: number;
  averageScore: number;
  pendingSignupRequests?: number;
}

interface SignupRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'hbl';
  paymentTransactionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
}

interface AdminMCQ {
  id: string;
  subject: string;
  topic: string;
  question: string;
  options: string[];
  answer: string;
  tip: string;
  difficulty: string;
}

interface LoginUser {
  id: string;
  role?: 'student' | 'admin';
}

const TOKEN_KEY = 'net360-admin-access-token';
const REFRESH_TOKEN_KEY = 'net360-admin-refresh-token';

function emptyForm() {
  return {
    id: '',
    subject: 'mathematics',
    topic: 'General',
    question: '',
    options: 'Option A\nOption B\nOption C\nOption D',
    answer: '',
    tip: '',
    difficulty: 'Medium',
  };
}

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm());

  const filteredMcqs = useMemo(() => {
    if (!query.trim()) return mcqs;
    const needle = query.toLowerCase();
    return mcqs.filter((item) =>
      [item.subject, item.topic, item.question, item.difficulty].join(' ').toLowerCase().includes(needle),
    );
  }, [mcqs, query]);

  const authToken = token;

  const clearAdminSession = () => {
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  };

  const loadAdminData = async (activeToken: string) => {
    const [overviewPayload, usersPayload, requestPayload, mcqPayload] = await Promise.all([
      apiRequest<AdminOverview>('/api/admin/overview', {}, activeToken),
      apiRequest<{ users: AdminUser[] }>('/api/admin/users', {}, activeToken),
      apiRequest<{ requests: SignupRequest[] }>('/api/admin/signup-requests?status=all', {}, activeToken),
      apiRequest<{ mcqs: AdminMCQ[] }>('/api/admin/mcqs', {}, activeToken),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setSignupRequests(requestPayload.requests || []);
    setMcqs(mcqPayload.mcqs || []);
  };

  useEffect(() => {
    if (!authToken) {
      setReady(true);
      return;
    }
    const currentToken: string = authToken;
    const currentRefreshToken: string | null = refreshToken;

    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAdminData(currentToken);
      } catch (error) {
        if (!cancelled) {
          const status = Number((error as { status?: number } | null)?.status || 0);
          const shouldTryRefresh = Boolean(currentRefreshToken) && (status === 401 || status === 403);

          if (shouldTryRefresh && currentRefreshToken) {
            try {
              const refreshed = await apiRequest<{ token: string; refreshToken: string; user: LoginUser }>('/api/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: currentRefreshToken }),
              });

              if (refreshed.user?.role !== 'admin') {
                clearAdminSession();
                return;
              }

              setToken(refreshed.token);
              setRefreshToken(refreshed.refreshToken);
              localStorage.setItem(TOKEN_KEY, refreshed.token);
              localStorage.setItem(REFRESH_TOKEN_KEY, refreshed.refreshToken);
              await loadAdminData(refreshed.token);
              return;
            } catch {
              clearAdminSession();
              return;
            }
          }

          if (status === 401 || status === 403) {
            clearAdminSession();
          } else {
            toast.error('Could not load admin data. Please try refreshing again.');
          }
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [authToken, refreshToken]);

  const login = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const payload = await apiRequest<{ token: string; refreshToken: string; user: LoginUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });

      if (payload.user?.role !== 'admin') {
        toast.error('Admin access required for this panel.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, payload.token);
      localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
      setToken(payload.token);
      setRefreshToken(payload.refreshToken);
      await loadAdminData(payload.token);
      toast.success('Admin login successful.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (refreshToken) {
      void apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearAdminSession();
  };

  const removeUser = async (user: AdminUser) => {
    if (!authToken) return;
    if (user.role === 'admin') {
      toast.error('For safety, admin accounts cannot be removed from this panel.');
      return;
    }
    if (!window.confirm(`Remove ${user.email}? They will have to login/register again.`)) return;

    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' }, authToken);
      toast.success('User removed successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove user.');
    }
  };

  const approveSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ requestId: string; token: { code: string; expiresAt: string } }>(
        `/api/admin/signup-requests/${request.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment verified by admin.' }),
        },
        authToken,
      );
      setIssuedTokens((prev) => ({ ...prev, [request.id]: payload.token.code }));
      toast.success(`Approved. Token: ${payload.token.code}`);
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve request.');
    }
  };

  const rejectSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Payment could not be verified.' }),
      }, authToken);
      toast.success('Request rejected.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject request.');
    }
  };

  const copyToken = async (tokenCode: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tokenCode);
      } else {
        const temp = document.createElement('textarea');
        temp.value = tokenCode;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Token copied to clipboard.');
    } catch {
      toast.error('Could not copy token.');
    }
  };

  const sendTokenBySms = (mobileNumber: string, tokenCode: string, email: string) => {
    const target = String(mobileNumber || '').trim();
    if (!target) {
      toast.error('Mobile number is missing for this request.');
      return;
    }

    const message = `NET360 approval token for ${email}: ${tokenCode}. Use this token to complete signup.`;
    const smsUrl = `sms:${encodeURIComponent(target)}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

  const resetForm = () => setForm(emptyForm());

  const saveMcq = async () => {
    if (!authToken) return;

    const options = form.options
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!form.question.trim() || !form.answer.trim() || options.length < 2) {
      toast.error('Question, answer, and at least 2 options are required.');
      return;
    }

    const payload = {
      subject: form.subject,
      topic: form.topic,
      question: form.question,
      options,
      answer: form.answer,
      tip: form.tip,
      difficulty: form.difficulty,
    };

    try {
      if (form.id) {
        await apiRequest(`/api/admin/mcqs/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('MCQ updated.');
      } else {
        await apiRequest('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('MCQ added.');
      }

      resetForm();
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save MCQ.');
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen p-5 flex items-center justify-center">
        <Card>
          <CardContent className="py-8">Loading admin panel...</CardContent>
        </Card>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="min-h-screen p-5 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>NET360 Admin Panel</CardTitle>
            <CardDescription>Separate management panel (outside student app)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <Button className="w-full" onClick={login} disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-5 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1>NET360 Admin Management</h1>
          <p className="text-sm text-muted-foreground">Manage users and MCQs from this separate panel</p>
        </div>
        <Button variant="outline" onClick={logout}>Logout</Button>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Registered Users" value={String(overview?.usersCount || 0)} />
        <Metric title="Question Bank" value={String(overview?.mcqCount || 0)} />
        <Metric title="Attempts" value={String(overview?.attemptsCount || 0)} />
        <Metric title="Average Score" value={`${overview?.averageScore || 0}%`} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Pending Signup Requests" value={String(overview?.pendingSignupRequests || 0)} />
        <Metric title="Approved Requests" value={String(signupRequests.filter((item) => item.status === 'approved').length)} />
        <Metric title="Completed Signups" value={String(signupRequests.filter((item) => item.status === 'completed').length)} />
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="requests">Signup Requests</TabsTrigger>
          <TabsTrigger value="mcqs">MCQs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Remove users when needed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'No name'}
                      {' • '}
                      {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown date'}
                    </p>
                    <Badge variant="outline" className="mt-1">{user.role}</Badge>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => void removeUser(user)}>
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Payment Approval Requests</CardTitle>
              <CardDescription>Verify transaction IDs and approve to generate signup token.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {signupRequests.map((request) => (
                <div key={request.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{request.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Mobile: {request.mobileNumber || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.paymentMethod.toUpperCase()} • Tx ID: {request.paymentTransactionId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}
                      </p>
                    </div>
                    <Badge variant={request.status === 'pending' ? 'default' : 'outline'}>{request.status}</Badge>
                  </div>

                  {issuedTokens[request.id] ? (
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs text-emerald-700 flex items-center justify-between gap-2">
                      <span>
                        Generated token: <strong>{issuedTokens[request.id]}</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void copyToken(issuedTokens[request.id])}
                      >
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => sendTokenBySms(request.mobileNumber, issuedTokens[request.id], request.email)}
                      >
                        Send SMS
                      </Button>
                    </div>
                  ) : null}

                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void approveSignupRequest(request)}>Approve + Generate Token</Button>
                      <Button size="sm" variant="outline" onClick={() => void rejectSignupRequest(request)}>Reject</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>MCQ Management</CardTitle>
              <CardDescription>Add or edit MCQs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select value={form.subject} onValueChange={(value) => setForm((prev) => ({ ...prev, subject: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mathematics">Mathematics</SelectItem>
                      <SelectItem value="physics">Physics</SelectItem>
                      <SelectItem value="chemistry">Chemistry</SelectItem>
                      <SelectItem value="english">English</SelectItem>
                      <SelectItem value="intelligence">Intelligence</SelectItem>
                      <SelectItem value="general-knowledge">General Knowledge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Difficulty</Label>
                  <Select value={form.difficulty} onValueChange={(value) => setForm((prev) => ({ ...prev, difficulty: value }))}>
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
                <Label>Topic</Label>
                <Input value={form.topic} onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Question</Label>
                <Textarea value={form.question} onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Options (one per line)</Label>
                <Textarea value={form.options} onChange={(e) => setForm((prev) => ({ ...prev, options: e.target.value }))} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Answer</Label>
                  <Input value={form.answer} onChange={(e) => setForm((prev) => ({ ...prev, answer: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Explanation</Label>
                  <Input value={form.tip} onChange={(e) => setForm((prev) => ({ ...prev, tip: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void saveMcq()}>{form.id ? 'Update' : 'Add'} MCQ</Button>
                <Button variant="outline" onClick={resetForm}>Clear</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MCQ Catalog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Search MCQs" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="space-y-2 max-h-[420px] overflow-auto">
                {filteredMcqs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-lg border p-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      setForm({
                        id: item.id,
                        subject: item.subject,
                        topic: item.topic,
                        question: item.question,
                        options: item.options.join('\n'),
                        answer: item.answer,
                        tip: item.tip,
                        difficulty: item.difficulty,
                      });
                    }}
                  >
                    <p className="line-clamp-2 text-sm">{item.question}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.subject} • {item.topic}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
