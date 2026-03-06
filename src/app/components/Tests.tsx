import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Clock, FileText, MapPin, Play, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { Difficulty, SubjectKey, getSubjectLabel } from '../lib/mcq';

const subjects: SubjectKey[] = ['mathematics', 'physics', 'english'];
const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];

interface TestsProps {
  onNavigate?: (section: string) => void;
}

export function Tests({ onNavigate }: TestsProps) {
  const { mcqsBySubjectAndDifficulty, attempts, startPracticeTest } = useAppData();

  const difficultyTone: Record<Difficulty, string> = {
    Easy: 'bg-indigo-100 text-indigo-700',
    Medium: 'bg-slate-200 text-slate-700',
    Hard: 'bg-rose-100 text-rose-700',
  };

  const topicTests = useMemo(() => {
    return subjects.flatMap((subject) => {
      return difficulties.map((difficulty) => {
        const subjectPool = mcqsBySubjectAndDifficulty[subject][difficulty];
        const topic = subjectPool[0]?.topic ?? 'All Topics';
        const topicPool = subjectPool.filter((item) => item.topic === topic);
        const questions = Math.min(25, Math.max(10, topicPool.length || subjectPool.length));
        const latest = attempts.find(
          (attempt) =>
            attempt.subject === subject &&
            attempt.difficulty === difficulty &&
            attempt.mode === 'topic' &&
            attempt.topic === topic,
        );

        return {
          id: `${subject}-${difficulty}-${topic}`,
          subject,
          topic,
          difficulty,
          questions,
          duration: Math.max(10, Math.round(questions * 1.2)),
          latest,
        };
      });
    });
  }, [attempts, mcqsBySubjectAndDifficulty]);

  const mockTests = useMemo(() => {
    return [1, 2, 3, 4].map((number) => {
      const latest = attempts.find((attempt) => attempt.mode === 'mock' && attempt.topic === `Mock ${number}`);
      return {
        number,
        name: `Full NET Engineering Mock #${number}`,
        questions: 200,
        duration: 180,
        latest,
        subjects: ['Math: 100', 'Physics: 60', 'English: 40'],
      };
    });
  }, [attempts]);

  const startTopicTest = async (subject: SubjectKey, difficulty: Difficulty, topic: string, questionCount: number) => {
    try {
      const attempt = await startPracticeTest({ subject, difficulty, topic, mode: 'topic', questionCount });
      if (!attempt) {
        toast.error('No questions available for this test configuration.');
        return;
      }
      toast.success(`Topic test completed: ${attempt.score}%`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start topic test.');
    }
  };

  const startMockTest = async (mockNumber: number) => {
    try {
      const attempt = await startPracticeTest({
        subject: 'mathematics',
        difficulty: 'Medium',
        topic: `Mock ${mockNumber}`,
        mode: 'mock',
        questionCount: 200,
      });
      if (!attempt) {
        toast.error('Mock test could not be generated from available dataset.');
        return;
      }
      toast.success(`Mock #${mockNumber} completed with ${attempt.score}%`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start mock test.');
    }
  };

  const startAdaptive = async (subject: SubjectKey) => {
    const subjectAttempts = attempts.filter((attempt) => attempt.subject === subject);
    const average = subjectAttempts.length
      ? subjectAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / subjectAttempts.length
      : 60;

    const targetDifficulty: Difficulty = average >= 80 ? 'Hard' : average >= 65 ? 'Medium' : 'Easy';
    try {
      const attempt = await startPracticeTest({
        subject,
        difficulty: targetDifficulty,
        topic: 'All Topics',
        mode: 'adaptive',
        questionCount: 20,
      });

      if (!attempt) {
        toast.error('No adaptive test can be generated yet for this subject.');
        return;
      }

      toast.success(`${getSubjectLabel(subject)} adaptive test completed: ${attempt.score}%`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start adaptive test.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">Run tests from your real MCQ bank and track outcomes instantly</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <TopMetaChip text="Topic-Wise Tests" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="Mock Tests" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="Adaptive" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="200 Questions" subtext="180 Minutes" icon={Clock} />
        <TopMetaChip text="NUST Centers" subtext="Computer-Based" icon={MapPin} />
      </div>

      <Tabs defaultValue="topic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 !bg-white/80 !border-indigo-100">
          <TabsTrigger value="topic">Topic-Wise Tests</TabsTrigger>
          <TabsTrigger value="mock">Mock Tests</TabsTrigger>
          <TabsTrigger value="adaptive">Adaptive</TabsTrigger>
        </TabsList>

        <TabsContent value="topic" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Topic-Wise Tests
              </CardTitle>
              <CardDescription>Run tests from your personalized MCQs and receive outcomes instantly</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {topicTests.map((test) => (
                  <div key={test.id} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h4 className="text-lg text-indigo-950">{test.topic}</h4>
                        <p className="text-slate-500">{getSubjectLabel(test.subject)}</p>
                      </div>
                      <div className="flex gap-1">
                        <span className={`rounded-md px-2 py-0.5 text-xs ${difficultyTone[test.difficulty]}`}>{test.difficulty}</span>
                        {test.latest ? <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Done</span> : null}
                      </div>
                    </div>

                    <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" />{test.questions} Questions</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{test.duration} minute</span>
                    </div>

                    <Button
                      className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                      onClick={() => void startTopicTest(test.subject, test.difficulty, test.topic, test.questions)}
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Start Test
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mock" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Full-Length Mock Tests
              </CardTitle>
              <CardDescription>Simulate full exam pacing and track mock history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {mockTests.map((test) => (
                  <div key={test.number} className="rounded-xl border border-indigo-100 bg-white p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="mb-2">{test.name}</h4>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {test.subjects.map((subject) => (
                            <Badge key={subject} variant="outline" className="text-xs">
                              {subject}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {test.latest ? (
                        <div className="text-right">
                          <div className="text-2xl mb-1">{test.latest.score}%</div>
                          <p className="text-xs text-muted-foreground">Latest Score</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {test.questions} Questions
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {test.duration} mins
                      </span>
                    </div>

                    {test.latest ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            onNavigate?.('analytics');
                            toast.message(`${test.name} report opened in Analytics.`);
                          }}
                        >
                          View Report
                        </Button>
                        <Button onClick={() => void startMockTest(test.number)}>Retake Test</Button>
                      </div>
                    ) : (
                      <Button className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white" onClick={() => void startMockTest(test.number)}>
                        <Play className="w-4 h-4 mr-2" />
                        Start Mock Test
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <h4 className="mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Mock Test Tips
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Keep a strict timer and complete all sections in one sitting.</li>
                <li>• Mark uncertain questions and revisit them in the final 15 minutes.</li>
                <li>• Use analytics after each mock to focus weak topics.</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adaptive" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Adaptive Practice
              </CardTitle>
              <CardDescription>Difficulty adjusts based on your historical performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {subjects.map((subject) => {
                  const subjectAttempts = attempts.filter((attempt) => attempt.subject === subject);
                  const average = subjectAttempts.length
                    ? Math.round(subjectAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / subjectAttempts.length)
                    : 0;

                  return (
                    <div key={subject} className="p-4 border border-indigo-100 rounded-lg bg-white">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4>{getSubjectLabel(subject)} Adaptive Set</h4>
                          <p className="text-sm text-muted-foreground">20 Questions • Dynamic Difficulty</p>
                        </div>
                        <Badge className="bg-orange-500">Recommended</Badge>
                      </div>
                      <div className="mb-3 text-sm text-muted-foreground">
                        Current average: {average ? `${average}%` : 'No attempts yet'}
                      </div>
                      <Button className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white" onClick={() => void startAdaptive(subject)}>
                        <Play className="w-4 h-4 mr-2" />
                        Start Adaptive Test
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TopMetaChip({
  text,
  subtext,
  tone,
  icon: Icon,
}: {
  text: string;
  subtext?: string;
  tone?: string;
  icon?: typeof Clock;
}) {
  return (
    <div className={`inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-gradient-to-r px-3 ${tone || 'from-white to-white'}`}>
      {Icon ? <Icon className="h-4 w-4 text-indigo-500" /> : null}
      <span className="text-sm font-medium text-slate-700">{text}</span>
      {subtext ? <span className="text-xs text-slate-400">{subtext}</span> : null}
    </div>
  );
}
