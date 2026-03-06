import { useMemo } from 'react';
import { Calendar, Clock, Target, TrendingUp, BookOpen, Brain, Calculator, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useAppData } from '../context/AppDataContext';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';

interface DashboardProps {
  onNavigate: (section: string) => void;
}

const TEST_DATE = new Date('2026-06-30T00:00:00');
const subjectOrder: SubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];

export function Dashboard({ onNavigate }: DashboardProps) {
  const { loading, mcqsBySubject, attempts, profile } = useAppData();

  const daysUntilNET = useMemo(() => {
    const now = new Date();
    const diffMs = TEST_DATE.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, []);

  const todayProgress = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const attemptedToday = attempts.filter((attempt) => new Date(attempt.attemptedAt) >= todayStart);

    const bySubject: Record<SubjectKey, number> = {
      mathematics: 0,
      physics: 0,
      english: 0,
      biology: 0,
      chemistry: 0,
    };

    attemptedToday.forEach((attempt) => {
      bySubject[attempt.subject] += 1;
    });

    return bySubject;
  }, [attempts]);

  const totalQuestions = subjectOrder.reduce((sum, subject) => sum + mcqsBySubject[subject].length, 0);
  const attemptedQuestions = attempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0);
  const overallProgress = totalQuestions ? Math.min(100, Math.round((attemptedQuestions / totalQuestions) * 100)) : 0;

  const firstName = profile.firstName?.trim() || 'Student';

  return (
    <div className="space-y-6">
      <div>
        <h1>Welcome back, {firstName}!</h1>
        <p className="text-muted-foreground">Let&apos;s continue your NET preparation journey</p>
      </div>

      <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Calendar className="w-5 h-5" />
            NET 2026 Countdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-5xl mb-2">{daysUntilNET} Days</div>
          <p className="text-blue-100">Stay focused and keep practicing!</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Today&apos;s Activity
          </CardTitle>
          <CardDescription>Tests completed today by subject</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subjectOrder.map((subject) => (
            <div key={subject}>
              <div className="flex justify-between mb-2">
                <span>{getSubjectLabel(subject)}</span>
                <span className="text-sm text-muted-foreground">{todayProgress[subject]} tests</span>
              </div>
              <Progress value={Math.min(100, todayProgress[subject] * 20)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Overall Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-2 text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading progress...
            </div>
          ) : (
            <>
              <div className="mb-2 text-3xl">{overallProgress}%</div>
              <Progress value={overallProgress} className="mb-2" />
              <p className="text-sm text-muted-foreground">
                {attempts.length ? `${attempts.length} tests completed so far.` : 'Start your first test from the Tests tab.'}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => onNavigate('preparation')}>
            <BookOpen className="w-6 h-6" />
            Start Practice
          </Button>
          <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => onNavigate('tests')}>
            <FileText className="w-6 h-6" />
            Mock Test
          </Button>
          <Button variant="outline" className="h-24 flex flex-col gap-2" onClick={() => onNavigate('ai-mentor')}>
            <Brain className="w-6 h-6" />
            AI Tutor
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => onNavigate('merit-calculator')}
          >
            <Calculator className="w-6 h-6" />
            Merit Predictor
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Latest Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
              <div>
                <p>MCQ dataset loaded from your folder and grouped by difficulty.</p>
                <p className="text-sm text-muted-foreground">Easy, Medium, and Hard are now available per subject.</p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
              <div>
                <p>All practice and test actions now update shared analytics instantly.</p>
                <p className="text-sm text-muted-foreground">No static progress values are used.</p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
