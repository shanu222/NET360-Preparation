import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface AdminOverview {
  usersCount: number;
  mcqCount: number;
  attemptsCount: number;
  averageScore: number;
  recentAttempts: Array<{ id: string; subject: string; score: number; attemptedAt: string }>;
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

export function AdminPanel() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    id: '',
    subject: 'mathematics',
    topic: 'General',
    question: '',
    options: 'Option A\nOption B\nOption C\nOption D',
    answer: '',
    tip: '',
    difficulty: 'Medium',
  });

  const isAdmin = user?.role === 'admin';

  const filteredMcqs = useMemo(() => {
    if (!query.trim()) return mcqs;
    const needle = query.toLowerCase();
    return mcqs.filter((item) =>
      [item.subject, item.topic, item.question, item.difficulty].join(' ').toLowerCase().includes(needle),
    );
  }, [mcqs, query]);

  useEffect(() => {
    if (!token || !isAdmin) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAdminData() {
      try {
        setLoading(true);
        const [overviewPayload, mcqPayload] = await Promise.all([
          apiRequest<AdminOverview>('/api/admin/overview', {}, token),
          apiRequest<{ mcqs: AdminMCQ[] }>('/api/admin/mcqs', {}, token),
        ]);

        if (!cancelled) {
          setOverview(overviewPayload);
          setMcqs(mcqPayload.mcqs || []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load admin data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  const resetForm = () => {
    setForm({
      id: '',
      subject: 'mathematics',
      topic: 'General',
      question: '',
      options: 'Option A\nOption B\nOption C\nOption D',
      answer: '',
      tip: '',
      difficulty: 'Medium',
    });
  };

  const saveMcq = async () => {
    if (!token || !isAdmin) {
      toast.error('Admin access required.');
      return;
    }

    const options = form.options
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!form.question.trim() || options.length < 2 || !form.answer.trim()) {
      toast.error('Question, at least two options, and answer are required.');
      return;
    }

    try {
      const payload = {
        subject: form.subject,
        topic: form.topic,
        question: form.question,
        options,
        answer: form.answer,
        tip: form.tip,
        difficulty: form.difficulty,
      };

      if (form.id) {
        const response = await apiRequest<{ mcq: AdminMCQ }>(
          `/api/admin/mcqs/${form.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload),
          },
          token,
        );

        setMcqs((prev) => prev.map((item) => (item.id === response.mcq.id ? response.mcq : item)));
        toast.success('MCQ updated successfully.');
      } else {
        const response = await apiRequest<{ mcq: AdminMCQ }>(
          '/api/admin/mcqs',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
          token,
        );

        setMcqs((prev) => [response.mcq, ...prev]);
        toast.success('MCQ added successfully.');
      }

      resetForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save MCQ.');
    }
  };

  if (!isAdmin) {
    return (
      <Card className="rounded-2xl border-rose-200 bg-rose-50/70">
        <CardHeader>
          <CardTitle>Admin Access Required</CardTitle>
          <CardDescription>This panel is only available for accounts with admin role.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-slate-500">Loading admin panel...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Admin Panel</h1>
        <p className="text-muted-foreground">Manage MCQs and monitor platform analytics</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mcqs">MCQ Management</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Users" value={String(overview?.usersCount || 0)} />
            <MetricCard title="MCQs" value={String(overview?.mcqCount || 0)} />
            <MetricCard title="Attempts" value={String(overview?.attemptsCount || 0)} />
            <MetricCard title="Avg Score" value={`${overview?.averageScore || 0}%`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Attempts</CardTitle>
              <CardDescription>Latest activity across users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(overview?.recentAttempts || []).map((attempt) => (
                <div key={attempt.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{attempt.subject}</span>
                  <span className="text-slate-600">{attempt.score}%</span>
                  <span className="text-xs text-slate-500">{new Date(attempt.attemptedAt).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcqs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Add / Edit MCQ</CardTitle>
              <CardDescription>Create new questions or update existing ones</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select value={form.subject} onValueChange={(value) => setForm((prev) => ({ ...prev, subject: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                  <Label>Correct Answer</Label>
                  <Input value={form.answer} onChange={(e) => setForm((prev) => ({ ...prev, answer: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Explanation</Label>
                  <Input value={form.tip} onChange={(e) => setForm((prev) => ({ ...prev, tip: e.target.value }))} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => void saveMcq()}>Save MCQ</Button>
                <Button variant="outline" onClick={resetForm}>Clear</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>MCQ Catalog</CardTitle>
              <CardDescription>Search and load an item to edit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Search by subject/topic/question" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="space-y-2 max-h-[420px] overflow-auto">
                {filteredMcqs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
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
                    className="w-full rounded-md border px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-2 text-sm text-slate-700">{item.question}</p>
                      <Badge variant="outline">{item.difficulty}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.subject} • {item.topic}</p>
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

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="rounded-xl border-indigo-100 bg-white/90">
      <CardContent className="pt-5">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-2xl text-indigo-950">{value}</p>
      </CardContent>
    </Card>
  );
}
