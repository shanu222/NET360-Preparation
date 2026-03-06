import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { FileText, Clock, Target, TrendingUp, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { Difficulty, SubjectKey, getSubjectLabel } from '../lib/mcq';

const subjects: SubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];

interface TestsProps {
  onNavigate: (section: string) => void;
}

export function Tests({ onNavigate }: TestsProps) {
  const { mcqsBySubjectAndDifficulty, attempts, startPracticeTest } = useAppData();

  const topicTests = useMemo(() => {
    return subjects.flatMap((subject) => {
      return difficulties.map((difficulty) => {
        const subjectPool = mcqsBySubjectAndDifficulty[subject][difficulty];
        if (!subjectPool.length) {
          return null;
        }
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
      }).filter((item): item is NonNullable<typeof item> => Boolean(item));
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

  const goToAnalytics = () => {
    onNavigate('analytics');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">Run tests from your real MCQ bank and track outcomes instantly</p>
      </div>

      <Tabs defaultValue="topic">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="topic">Topic Tests</TabsTrigger>
          <TabsTrigger value="mock">Mock Tests</TabsTrigger>
          <TabsTrigger value="adaptive">Adaptive</TabsTrigger>
        </TabsList>

        <TabsContent value="topic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Topic-Wise Tests
              </CardTitle>
              <CardDescription>Generated from your MCQ dataset by subject and difficulty</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topicTests.length ? topicTests.map((test) => (
                  <div key={test.id} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4>{test.topic}</h4>
                          {test.latest ? <Badge variant="secondary" className="text-xs">Completed</Badge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">{getSubjectLabel(test.subject)}</p>
                      </div>
                      <Badge
                        variant={
                          test.difficulty === 'Easy'
                            ? 'default'
                            : test.difficulty === 'Medium'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {test.difficulty}
                      </Badge>
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
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Latest Score</span>
                          <span>{test.latest.score}%</span>
                        </div>
                        <Progress value={test.latest.score} />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={goToAnalytics}
                          >
                            Review
                          </Button>
                          <Button
                            className="w-full"
                            onClick={() => void startTopicTest(test.subject, test.difficulty, test.topic, test.questions)}
                          >
                            Retake
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => void startTopicTest(test.subject, test.difficulty, test.topic, test.questions)}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Test
                      </Button>
                    )}
                  </div>
                )) : (
                  <div className="p-4 border rounded-lg text-sm text-muted-foreground">
                    No topic tests available yet. Add MCQs for the selected subjects/difficulties and refresh.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Full-Length Mock Tests
              </CardTitle>
              <CardDescription>Simulate full exam pacing and track mock history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockTests.map((test) => (
                  <div key={test.number} className="p-4 border rounded-lg">
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
                        <Button variant="outline" onClick={goToAnalytics}>
                          View Report
                        </Button>
                        <Button onClick={() => void startMockTest(test.number)}>Retake Test</Button>
                      </div>
                    ) : (
                      <Button className="w-full" onClick={() => void startMockTest(test.number)}>
                        <Play className="w-4 h-4 mr-2" />
                        Start Mock Test
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
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
          <Card>
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
                  const availableQuestions = difficulties.reduce(
                    (sum, difficulty) => sum + mcqsBySubjectAndDifficulty[subject][difficulty].length,
                    0,
                  );
                  const average = subjectAttempts.length
                    ? Math.round(subjectAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / subjectAttempts.length)
                    : 0;

                  return (
                    <div key={subject} className="p-4 border rounded-lg">
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
                      <Button className="w-full" onClick={() => void startAdaptive(subject)} disabled={!availableQuestions}>
                        <Play className="w-4 h-4 mr-2" />
                        {availableQuestions ? 'Start Adaptive Test' : 'No Questions Available'}
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
