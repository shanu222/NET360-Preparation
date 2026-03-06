import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { FileText, Clock, Target, TrendingUp, Play } from 'lucide-react';

export function Tests() {
  const topicTests = [
    {
      subject: 'Mathematics',
      topic: 'Calculus - Derivatives',
      questions: 20,
      duration: 20,
      difficulty: 'Medium',
      attempted: false
    },
    {
      subject: 'Mathematics',
      topic: 'Trigonometry',
      questions: 25,
      duration: 25,
      difficulty: 'Easy',
      attempted: true,
      score: 85
    },
    {
      subject: 'Physics',
      topic: 'Electromagnetism',
      questions: 20,
      duration: 20,
      difficulty: 'Hard',
      attempted: false
    },
    {
      subject: 'Physics',
      topic: 'Mechanics',
      questions: 30,
      duration: 30,
      difficulty: 'Medium',
      attempted: true,
      score: 78
    },
    {
      subject: 'English',
      topic: 'Grammar & Sentence Correction',
      questions: 15,
      duration: 15,
      difficulty: 'Easy',
      attempted: false
    }
  ];

  const mockTests = [
    {
      name: 'Full NET Engineering Mock #1',
      questions: 200,
      duration: 180,
      attempted: true,
      score: 72,
      subjects: ['Math: 100', 'Physics: 60', 'English: 40']
    },
    {
      name: 'Full NET Engineering Mock #2',
      questions: 200,
      duration: 180,
      attempted: true,
      score: 76,
      subjects: ['Math: 100', 'Physics: 60', 'English: 40']
    },
    {
      name: 'Full NET Engineering Mock #3',
      questions: 200,
      duration: 180,
      attempted: false,
      subjects: ['Math: 100', 'Physics: 60', 'English: 40']
    },
    {
      name: 'Full NET Engineering Mock #4',
      questions: 200,
      duration: 180,
      attempted: false,
      subjects: ['Math: 100', 'Physics: 60', 'English: 40']
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">Test your preparation with topic-wise and full-length tests</p>
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
              <CardDescription>Practice specific topics with focused tests</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topicTests.map((test, index) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4>{test.topic}</h4>
                          {test.attempted && (
                            <Badge variant="secondary" className="text-xs">Completed</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{test.subject}</p>
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

                    {test.attempted && test.score !== undefined ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Your Score</span>
                          <span>{test.score}%</span>
                        </div>
                        <Progress value={test.score} />
                        <Button variant="outline" className="w-full mt-2">
                          Review Answers
                        </Button>
                      </div>
                    ) : (
                      <Button className="w-full">
                        <Play className="w-4 h-4 mr-2" />
                        Start Test
                      </Button>
                    )}
                  </div>
                ))}
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
              <CardDescription>Simulate the real NET experience</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockTests.map((test, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="mb-2">{test.name}</h4>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {test.subjects.map((subject, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {subject}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {test.attempted && test.score !== undefined && (
                        <div className="text-right">
                          <div className="text-2xl mb-1">{test.score}%</div>
                          <p className="text-xs text-muted-foreground">Your Score</p>
                        </div>
                      )}
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

                    {test.attempted ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline">View Report</Button>
                        <Button>Retake Test</Button>
                      </div>
                    ) : (
                      <Button className="w-full">
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
                <li>• Take tests in a quiet environment without distractions</li>
                <li>• Use the full allocated time to review your answers</li>
                <li>• Don't spend too much time on difficult questions</li>
                <li>• Review your mistakes thoroughly after each test</li>
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
              <CardDescription>AI-powered practice based on your weak areas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg">
                <h4 className="mb-2 text-white">How it works</h4>
                <p className="text-sm text-purple-100">
                  Our AI analyzes your performance and creates personalized practice sets
                  focusing on topics where you need improvement. The difficulty adapts based
                  on your answers.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4>Mathematics Weak Areas</h4>
                      <p className="text-sm text-muted-foreground">25 Questions • Adaptive Difficulty</p>
                    </div>
                    <Badge className="bg-orange-500">Recommended</Badge>
                  </div>
                  <div className="mb-3 text-sm">
                    <p className="text-muted-foreground">Focus areas:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">Integration</Badge>
                      <Badge variant="outline" className="text-xs">Matrices</Badge>
                      <Badge variant="outline" className="text-xs">Analytical Geometry</Badge>
                    </div>
                  </div>
                  <Button className="w-full">
                    <Play className="w-4 h-4 mr-2" />
                    Start Adaptive Test
                  </Button>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4>Physics Weak Areas</h4>
                      <p className="text-sm text-muted-foreground">20 Questions • Adaptive Difficulty</p>
                    </div>
                    <Badge className="bg-orange-500">Recommended</Badge>
                  </div>
                  <div className="mb-3 text-sm">
                    <p className="text-muted-foreground">Focus areas:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">Electromagnetism</Badge>
                      <Badge variant="outline" className="text-xs">Modern Physics</Badge>
                    </div>
                  </div>
                  <Button className="w-full">
                    <Play className="w-4 h-4 mr-2" />
                    Start Adaptive Test
                  </Button>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4>English Practice</h4>
                      <p className="text-sm text-muted-foreground">15 Questions • Adaptive Difficulty</p>
                    </div>
                  </div>
                  <div className="mb-3 text-sm">
                    <p className="text-muted-foreground">Focus areas:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="outline" className="text-xs">Sentence Correction</Badge>
                      <Badge variant="outline" className="text-xs">Comprehension</Badge>
                    </div>
                  </div>
                  <Button className="w-full" variant="outline">
                    <Play className="w-4 h-4 mr-2" />
                    Start Adaptive Test
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
