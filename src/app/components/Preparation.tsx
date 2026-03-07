import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Progress } from './ui/progress';
import { BookOpen, ChevronRight, CheckCircle, Circle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { Difficulty, SubjectKey, getSubjectLabel } from '../lib/mcq';

const subjectTabs: SubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
type AcademicPart = 'part1' | 'part2';

const PART_LABELS: Record<SubjectKey, Record<AcademicPart, string>> = {
  mathematics: {
    part1: 'Mathematics - FSc Part 1 (1st Year)',
    part2: 'Mathematics - FSc Part 2 (2nd Year)',
  },
  physics: {
    part1: 'Physics - FSc Part 1 (1st Year)',
    part2: 'Physics - FSc Part 2 (2nd Year)',
  },
  english: {
    part1: 'English - Intermediate Part 1',
    part2: 'English - Intermediate Part 2',
  },
  biology: {
    part1: 'Biology - FSc Part 1 (1st Year)',
    part2: 'Biology - FSc Part 2 (2nd Year)',
  },
  chemistry: {
    part1: 'Chemistry - FSc Part 1 (1st Year)',
    part2: 'Chemistry - FSc Part 2 (2nd Year)',
  },
};

const TOPIC_PART_KEYWORDS: Record<SubjectKey, Record<AcademicPart, string[]>> = {
  mathematics: {
    part1: ['sets', 'functions', 'matrices', 'determinants', 'trigonometry', 'quadratic', 'sequences', 'series'],
    part2: ['integration', 'differentiation', 'limits', 'statistics', 'probability', 'vectors', 'analytical geometry'],
  },
  physics: {
    part1: ['kinematics', 'dynamics', 'work energy power', 'rotational motion', 'circular motion', 'thermodynamics', 'waves', 'shm'],
    part2: ['electrostatics', 'current electricity', 'magnetism', 'electromagnetic induction', 'optics', 'modern physics'],
  },
  english: {
    part1: ['grammar', 'vocabulary', 'synonyms', 'antonyms'],
    part2: ['reading comprehension', 'sentence correction', 'analogies'],
  },
  biology: {
    part1: ['cell', 'bioenergetics', 'enzymes', 'microorganisms', 'kingdom', 'transport', 'digestion'],
    part2: ['coordination', 'support', 'reproduction', 'evolution', 'genetics', 'ecology'],
  },
  chemistry: {
    part1: ['basic concepts', 'atomic structure', 'chemical bonding', 'gases', 'liquids', 'thermochemistry', 'equilibrium'],
    part2: ['electrochemistry', 'reaction kinetics', 'organic', 'hydrocarbons', 'alkyl halides', 'aldehydes', 'carboxylic acids'],
  },
};

const difficultyOrder: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export function Preparation() {
  const [selectedTopicBySubject, setSelectedTopicBySubject] = useState<Record<SubjectKey, string | null>>({
    mathematics: null,
    physics: null,
    english: null,
    biology: null,
    chemistry: null,
  });
  const [selectedPartBySubject, setSelectedPartBySubject] = useState<Record<SubjectKey, AcademicPart | null>>({
    mathematics: null,
    physics: null,
    english: null,
    biology: null,
    chemistry: null,
  });

  const { loading, error, mcqsBySubject, mcqsBySubjectAndDifficulty, attempts, startPracticeTest } = useAppData();

  const topicsBySubject = useMemo(() => {
    const result = {} as Record<SubjectKey, Array<{ topic: string; count: number }>>;

    subjectTabs.forEach((subject) => {
      const map = new Map<string, number>();
      mcqsBySubject[subject].forEach((mcq) => {
        map.set(mcq.topic, (map.get(mcq.topic) ?? 0) + 1);
      });

      result[subject] = Array.from(map.entries())
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
    });

    return result;
  }, [mcqsBySubject]);

  const resolveTopicPart = (subject: SubjectKey, topic: string, index: number, total: number): AcademicPart => {
    const normalized = topic.trim().toLowerCase();
    const part1Match = TOPIC_PART_KEYWORDS[subject].part1.some((keyword) => normalized.includes(keyword));
    if (part1Match) return 'part1';
    const part2Match = TOPIC_PART_KEYWORDS[subject].part2.some((keyword) => normalized.includes(keyword));
    if (part2Match) return 'part2';
    return index < Math.ceil(total / 2) ? 'part1' : 'part2';
  };

  const topicsBySubjectAndPart = useMemo(() => {
    const result: Record<SubjectKey, Record<AcademicPart, Array<{ topic: string; count: number }>>> = {
      mathematics: { part1: [], part2: [] },
      physics: { part1: [], part2: [] },
      english: { part1: [], part2: [] },
      biology: { part1: [], part2: [] },
      chemistry: { part1: [], part2: [] },
    };

    subjectTabs.forEach((subject) => {
      const subjectTopics = topicsBySubject[subject];
      subjectTopics.forEach((entry, index) => {
        const part = resolveTopicPart(subject, entry.topic, index, subjectTopics.length);
        result[subject][part].push(entry);
      });
    });

    return result;
  }, [topicsBySubject]);

  const completedTopicsBySubject = useMemo(() => {
    const done = {} as Record<SubjectKey, Set<string>>;

    subjectTabs.forEach((subject) => {
      const completed = new Set<string>();
      attempts.forEach((attempt) => {
        if (attempt.score >= 70 && attempt.subject === subject) {
          completed.add(attempt.topic);
        }
      });
      done[subject] = completed;
    });

    return done;
  }, [attempts]);

  const startDifficultyPractice = async (subject: SubjectKey, difficulty: Difficulty, topic: string) => {
    try {
      const attempt = await startPracticeTest({
        subject,
        difficulty,
        topic,
        mode: 'topic',
        questionCount: 20,
      });

      if (!attempt) {
        toast.error('No questions available for this selection yet.');
        return;
      }

      toast.success(`${getSubjectLabel(subject)} ${difficulty} test completed. Score: ${attempt.score}%`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start test.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Real MCQs organized by subject, topic, and difficulty</p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading MCQ dataset...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="py-6 text-red-600">{error}</CardContent>
        </Card>
      ) : null}

      {!loading && !error ? (
        <Tabs defaultValue="mathematics">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <TabsTrigger value="mathematics">Mathematics</TabsTrigger>
            <TabsTrigger value="physics">Physics</TabsTrigger>
            <TabsTrigger value="english">English</TabsTrigger>
            <TabsTrigger value="biology">Biology</TabsTrigger>
            <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
          </TabsList>

          {subjectTabs.map((subject) => {
            const selectedPart = selectedPartBySubject[subject];
            const topics = selectedPart ? topicsBySubjectAndPart[subject][selectedPart] : [];
            const selectedTopic = selectedTopicBySubject[subject];
            const subjectMcqs = mcqsBySubject[subject];
            const completedTopics = completedTopicsBySubject[subject];

            return (
              <TabsContent key={subject} value={subject} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{getSubjectLabel(subject)} Preparation</CardTitle>
                    <CardDescription>
                      {subjectMcqs.length} total questions across {topicsBySubject[subject].length} topics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      {(['part1', 'part2'] as AcademicPart[]).map((part) => {
                        const isSelected = selectedPart === part;
                        const partTopics = topicsBySubjectAndPart[subject][part];
                        const partCount = partTopics.reduce((sum, item) => sum + item.count, 0);
                        return (
                          <button
                            key={`${subject}-${part}`}
                            type="button"
                            onClick={() => {
                              setSelectedPartBySubject((prev) => ({ ...prev, [subject]: part }));
                              setSelectedTopicBySubject((prev) => ({ ...prev, [subject]: null }));
                            }}
                            className={`rounded-xl border p-3 text-left transition ${isSelected ? 'border-indigo-300 bg-indigo-50/60' : 'border-indigo-100 bg-white hover:bg-indigo-50/40'}`}
                          >
                            <p className="text-sm font-semibold text-indigo-950">{PART_LABELS[subject][part]}</p>
                            <p className="mt-1 text-xs text-slate-500">{partCount} MCQs • {partTopics.length} topics</p>
                          </button>
                        );
                      })}
                    </div>

                    {!selectedPart ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        Select Part 1 or Part 2 to continue.
                      </div>
                    ) : !topics.length ? (
                      <div className="text-sm text-muted-foreground py-6 text-center">
                        No MCQs found for {PART_LABELS[subject][selectedPart]} in your dataset.
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-3">
                          {topics.map((item) => {
                            const topicAttempts = attempts.filter(
                              (attempt) => attempt.subject === subject && attempt.topic === item.topic,
                            );
                            const topicProgress = Math.min(100, topicAttempts.length * 20);

                            return (
                              <div
                                key={item.topic}
                                className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                                onClick={() =>
                                  setSelectedTopicBySubject((prev) => ({
                                    ...prev,
                                    [subject]: item.topic,
                                  }))
                                }
                              >
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4>{item.topic}</h4>
                                      {completedTopics.has(item.topic) ? (
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                      ) : null}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {item.count} MCQs • {topicAttempts.length} attempts
                                    </p>
                                  </div>
                                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <Progress value={topicProgress} />
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {selectedTopic ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        {selectedTopic}
                      </CardTitle>
                      <CardDescription>Start a test by selecting a difficulty level</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3">
                        {difficultyOrder.map((difficulty) => {
                          const count = mcqsBySubjectAndDifficulty[subject][difficulty].filter(
                            (mcq) => mcq.topic === selectedTopic,
                          ).length;

                          return (
                            <Button
                              key={difficulty}
                              variant="outline"
                              className="justify-start"
                              disabled={!count}
                              onClick={() => void startDifficultyPractice(subject, difficulty, selectedTopic)}
                            >
                              <Circle className="w-4 h-4 mr-2" />
                              {difficulty} Practice ({count} MCQs)
                            </Button>
                          );
                        })}
                      </div>

                      <div className="pt-4 border-t">
                        <Button
                          className="w-full"
                          onClick={() => void startDifficultyPractice(subject, 'Medium', selectedTopic)}
                        >
                          Start Practicing
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Study Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">1</Badge>
              <span>Start with Easy questions, then move to Medium and Hard for each topic.</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">2</Badge>
              <span>Attempt each topic at least three times to improve retention and speed.</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">3</Badge>
              <span>Use your score trends in Analytics to prioritize weak areas.</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">4</Badge>
              <span>Re-attempt hard topics after 24 hours for better long-term memory.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
