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
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
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

  const loadAdminData = async (activeToken: string) => {
    const [overviewPayload, usersPayload, mcqPayload] = await Promise.all([
      apiRequest<AdminOverview>('/api/admin/overview', {}, activeToken),
      apiRequest<{ users: AdminUser[] }>('/api/admin/users', {}, activeToken),
      apiRequest<{ mcqs: AdminMCQ[] }>('/api/admin/mcqs', {}, activeToken),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setMcqs(mcqPayload.mcqs || []);
  };

  useEffect(() => {
    if (!authToken) {
      setReady(true);
      return;
    }
    const currentToken: string = authToken;

    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAdminData(currentToken);
      } catch {
        if (!cancelled) {
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
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
  }, [authToken]);

  const login = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const payload = await apiRequest<{ token: string; user: LoginUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });

      if (payload.user?.role !== 'admin') {
        toast.error('Admin access required for this panel.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
      await loadAdminData(payload.token);
      toast.success('Admin login successful.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  };

  const removeUser = async (user: AdminUser) => {
    if (!authToken) return;
    if (!window.confirm(`Remove ${user.email}? They will have to login/register again.`)) return;

    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' }, authToken);
      toast.success('User removed successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove user.');
    }
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

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="users">Users</TabsTrigger>
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
