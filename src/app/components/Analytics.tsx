import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { TrendingUp, Target, Award, AlertCircle } from 'lucide-react';
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
    .slice(0, 4)
    .map((item) => ({
      ...item,
      improvement: item.accuracy < 55 ? 'High Priority' : 'Medium Priority',
    }));

  const strongAreas = topicAccuracy
    .filter((item) => item.accuracy > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 4);

  const questionBankSize = mcqsBySubject.mathematics.length + mcqsBySubject.physics.length + mcqsBySubject.english.length;

  return (
    <div className="space-y-6">
      <div>
        <h1>Performance Analytics</h1>
        <p className="text-muted-foreground">Live analytics based on your actual attempts</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void exportReport('csv')}>
          Export CSV
        </Button>
        <Button variant="outline" onClick={() => void exportReport('json')}>
          Export JSON
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Tests Attempted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.testsAttempted}</div>
            <p className="text-xs text-muted-foreground mt-1">Real test records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.averageScore}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="w-3 h-3 inline mr-1 text-green-500" />
              Based on all attempts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.timeSpent}h</div>
            <p className="text-xs text-muted-foreground mt-1">Computed from test duration</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Questions Solved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.questionsAttempted}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <Target className="w-3 h-3 inline mr-1" />
              Bank size: {questionBankSize}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subject-Wise Performance</CardTitle>
          <CardDescription>Your measured accuracy in each subject</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {subjectPerformance.map((subject) => (
              <div key={subject.key}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4>{subject.subject}</h4>
                    <Badge variant="outline">{subject.accuracy}%</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {subject.correct}/{subject.attempted} correct
                  </span>
                </div>
                <Progress value={subject.accuracy} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Progress Over Time</CardTitle>
            <CardDescription>Weekly average test scores</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Topic Performance</CardTitle>
            <CardDescription>Score distribution by subject</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="topic" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Score" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.5} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Weak Areas
          </CardTitle>
          <CardDescription>Lowest-performing attempted topics</CardDescription>
        </CardHeader>
        <CardContent>
          {weakAreas.length ? (
            <div className="space-y-3">
              {weakAreas.map((area) => (
                <div key={`${area.subject}-${area.topic}`} className="p-4 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4>{area.topic}</h4>
                      <p className="text-sm text-muted-foreground">{area.subject}</p>
                    </div>
                    <Badge variant="destructive">{area.improvement}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={area.accuracy} className="flex-1" />
                    <span className="text-sm">{area.accuracy}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No weak-area data yet. Complete a few tests to generate insights.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-green-500" />
            Strong Areas
          </CardTitle>
          <CardDescription>Best-performing attempted topics</CardDescription>
        </CardHeader>
        <CardContent>
          {strongAreas.length ? (
            <div className="space-y-3">
              {strongAreas.map((area) => (
                <div key={`${area.subject}-${area.topic}`} className="p-4 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4>{area.topic}</h4>
                      <p className="text-sm text-muted-foreground">{area.subject}</p>
                    </div>
                    <Badge className="bg-green-500">Strong</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={area.accuracy} className="flex-1" />
                    <span className="text-sm">{area.accuracy}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Strong areas will appear after first completed attempts.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
