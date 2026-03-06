import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';
import { Button } from './ui/button';
import { downloadReport } from '../lib/api';
import { toast } from 'sonner';

const subjects: SubjectKey[] = ['mathematics', 'physics', 'english'];

export function Analytics() {
  const { attempts, mcqsBySubject } = useAppData();
  const { token, user } = useAuth();

  const exportReport = async (format: 'csv' | 'json') => {
    if (!user) {
      toast.error('Please login to export reports.');
      return;
    }

    try {
      const { blob, filename } = await downloadReport(`/api/reports/export?format=${format}`, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  const overallStats = useMemo(() => {
    const testsAttempted = attempts.length;
    const averageScore = testsAttempted
      ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / testsAttempted)
      : 0;
    const timeSpent = Math.round(attempts.reduce((sum, attempt) => sum + attempt.durationMinutes, 0) / 60);
    const questionsAttempted = attempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0);

    return { testsAttempted, averageScore, timeSpent, questionsAttempted };
  }, [attempts]);

  const subjectPerformance = useMemo(() => {
    return subjects.map((subject) => {
      const subjectAttempts = attempts.filter((attempt) => attempt.subject === subject);
      const attempted = subjectAttempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0);
      const correct = subjectAttempts.reduce(
        (sum, attempt) => sum + Math.round((attempt.score / 100) * attempt.totalQuestions),
        0,
      );
      const accuracy = attempted ? Math.round((correct / attempted) * 100) : 0;

      return {
        subject: getSubjectLabel(subject),
        key: subject,
        accuracy,
        attempted,
        correct,
      };
    });
  }, [attempts]);

  const progressData = useMemo(() => {
    const grouped = new Map<string, number[]>();

    attempts.forEach((attempt) => {
      const date = new Date(attempt.attemptedAt);
      const weekLabel = `${date.getFullYear()}-W${Math.ceil((date.getDate() + 6 - date.getDay()) / 7)}`;
      const existing = grouped.get(weekLabel) ?? [];
      existing.push(attempt.score);
      grouped.set(weekLabel, existing);
    });

    return Array.from(grouped.entries())
      .map(([week, scores]) => ({
        week,
        score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
      }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8);
  }, [attempts]);

  const radarData = useMemo(() => {
    return subjectPerformance.map((item) => ({ topic: item.subject, score: item.accuracy }));
  }, [subjectPerformance]);

  const topicAccuracy = useMemo(() => {
    const map = new Map<string, { subject: SubjectKey; total: number; weightedScore: number }>();

    attempts.forEach((attempt) => {
      const key = `${attempt.subject}::${attempt.topic}`;
      const existing = map.get(key) ?? {
        subject: attempt.subject,
        total: 0,
        weightedScore: 0,
      };
      existing.total += attempt.totalQuestions;
      existing.weightedScore += Math.round((attempt.score / 100) * attempt.totalQuestions);
      map.set(key, existing);
    });

    return Array.from(map.entries()).map(([key, value]) => {
      const [, topic] = key.split('::');
      const accuracy = value.total ? Math.round((value.weightedScore / value.total) * 100) : 0;
      return { topic, subject: getSubjectLabel(value.subject), accuracy };
    });
  }, [attempts]);

  const weakAreas = topicAccuracy
    .filter((item) => item.accuracy > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4);

  const questionBankSize =
    mcqsBySubject.mathematics.length + mcqsBySubject.physics.length + mcqsBySubject.english.length;

  return (
    <div className="space-y-5">
      <div>
        <h1>Performance Analytics</h1>
        <p className="text-muted-foreground">Live analytics based on your actual attempts</p>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-white/75 p-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-indigo-200 bg-white text-indigo-700"
            onClick={() => void exportReport('csv')}
          >
            Export CSV
          </Button>
          <Button
            variant="outline"
            className="border-indigo-200 bg-white text-indigo-700"
            onClick={() => void exportReport('json')}
          >
            Export JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="rounded-xl border-indigo-100 bg-white/92">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Tests Attempted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl text-indigo-950">{overallStats.testsAttempted}</div>
            <p className="mt-1 text-xs text-slate-500">Total test records</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-indigo-100 bg-white/92">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl text-indigo-950">{overallStats.averageScore}%</div>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
              <TrendingUp className="h-3 w-3 text-indigo-500" />
              Average % of Correct Answers
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-indigo-100 bg-white/92">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl text-indigo-950">{overallStats.timeSpent}h</div>
            <p className="mt-1 text-xs text-slate-500">Cumulative total from last 30 days</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-indigo-100 bg-white/92">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-700">Questions Solved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl text-indigo-950">{overallStats.questionsAttempted}</div>
            <p className="mt-1 text-xs text-slate-500">Total MCQs attempted (bank: {questionBankSize})</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/90">
        <CardHeader>
          <CardTitle>Subject-Wise Performance</CardTitle>
          <CardDescription>Your measured accuracy in each subject</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-white p-4">
                <div className="space-y-4">
                  {subjectPerformance.map((subject, idx) => (
                    <div key={subject.key}>
                      <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                        <div className="inline-flex items-center gap-2">
                          <span className="text-indigo-950">{subject.subject}</span>
                          <span>{subject.accuracy}%</span>
                        </div>
                        <span>{subject.correct}/{subject.attempted} correct</span>
                      </div>
                      <Progress
                        value={subject.accuracy}
                        className={`h-2 bg-slate-200 ${
                          idx === 0
                            ? '[&>[data-slot=progress-indicator]]:bg-indigo-500'
                            : idx === 1
                              ? '[&>[data-slot=progress-indicator]]:bg-violet-400'
                              : '[&>[data-slot=progress-indicator]]:bg-teal-400'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-white p-4">
                <h4 className="mb-1 text-indigo-950">Progress Over Time</h4>
                <p className="mb-3 text-sm text-slate-500">Weekly average test scores</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={progressData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0ff" />
                    <XAxis dataKey="week" hide />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#8a8ef5" strokeWidth={2.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-100 bg-white p-4">
                <h4 className="mb-1 text-indigo-950">Topic Performance</h4>
                <p className="mb-3 text-sm text-slate-500">Score distribution by subject</p>
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#d8dcff" />
                    <PolarAngleAxis dataKey="topic" tick={{ fill: '#68709c', fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke="#8a8ef5" fill="#8a8ef5" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-white p-4">
                <h4 className="mb-1 inline-flex items-center gap-2 text-indigo-950">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Weak Areas
                </h4>
                <p className="mb-3 text-sm text-slate-500">Lowest performing attempted topics</p>
                {weakAreas.length ? (
                  <div className="space-y-2">
                    {weakAreas.slice(0, 3).map((area) => (
                      <div key={`${area.subject}-${area.topic}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{area.topic}</span>
                          <Badge variant="destructive">{area.accuracy}%</Badge>
                        </div>
                        <p className="text-xs text-slate-500">{area.subject}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Newly-weak areas stay alert. Complete a few tests to generate insights.
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
