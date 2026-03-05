import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Target, Award, AlertCircle } from 'lucide-react';

export function Analytics() {
  const overallStats = {
    testsAttempted: 12,
    averageScore: 74,
    timeSpent: 48,
    questionsAttempted: 1840
  };

  const subjectPerformance = [
    { subject: 'Math', accuracy: 72, attempted: 600, correct: 432 },
    { subject: 'Physics', accuracy: 65, attempted: 480, correct: 312 },
    { subject: 'English', accuracy: 81, attempted: 280, correct: 227 }
  ];

  const progressData = [
    { week: 'Week 1', score: 58 },
    { week: 'Week 2', score: 62 },
    { week: 'Week 3', score: 68 },
    { week: 'Week 4', score: 72 },
    { week: 'Week 5', score: 74 },
    { week: 'Week 6', score: 76 }
  ];

  const radarData = [
    { topic: 'Algebra', score: 85 },
    { topic: 'Calculus', score: 65 },
    { topic: 'Trigonometry', score: 78 },
    { topic: 'Mechanics', score: 72 },
    { topic: 'Electricity', score: 58 },
    { topic: 'English', score: 81 }
  ];

  const weakAreas = [
    { topic: 'Electromagnetism', subject: 'Physics', accuracy: 45, improvement: 'High Priority' },
    { topic: 'Integration', subject: 'Mathematics', accuracy: 52, improvement: 'High Priority' },
    { topic: 'Matrices', subject: 'Mathematics', accuracy: 58, improvement: 'Medium Priority' },
    { topic: 'Modern Physics', subject: 'Physics', accuracy: 61, improvement: 'Medium Priority' }
  ];

  const strongAreas = [
    { topic: 'Vocabulary', subject: 'English', accuracy: 92 },
    { topic: 'Mechanics', subject: 'Physics', accuracy: 88 },
    { topic: 'Algebra', subject: 'Mathematics', accuracy: 85 }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1>Performance Analytics</h1>
        <p className="text-muted-foreground">Track your progress and identify areas for improvement</p>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Tests Attempted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.testsAttempted}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              +3 this week
            </p>
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
              +4% improvement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Study Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{overallStats.timeSpent}h</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
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
              Target: 2000
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Subject Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Subject-Wise Performance</CardTitle>
          <CardDescription>Your accuracy in each subject</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {subjectPerformance.map((subject, index) => (
              <div key={index}>
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
        {/* Progress Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Progress Over Time</CardTitle>
            <CardDescription>Your score trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic Performance Radar */}
        <Card>
          <CardHeader>
            <CardTitle>Topic Performance</CardTitle>
            <CardDescription>Performance across different topics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="topic" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} />
                <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Weak Areas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Weak Areas
          </CardTitle>
          <CardDescription>Topics that need more attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {weakAreas.map((area, index) => (
              <div key={index} className="p-4 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 rounded-lg">
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

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <h4 className="mb-2">AI Recommendations</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Focus on Electromagnetism - Practice 30 questions daily</li>
              <li>• Review Integration techniques - Complete theory section first</li>
              <li>• Take adaptive tests for weak topics to track improvement</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Strong Areas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-green-500" />
            Strong Areas
          </CardTitle>
          <CardDescription>Topics where you excel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {strongAreas.map((area, index) => (
              <div key={index} className="p-4 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 rounded-lg">
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
        </CardContent>
      </Card>
    </div>
  );
}
