import { Calendar, Clock, Target, TrendingUp, BookOpen, Brain, Calculator, FileText } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

interface DashboardProps {
  onNavigate: (section: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const daysUntilNET = 120;
  const todayProgress = {
    mathematics: { completed: 18, target: 20 },
    physics: { completed: 15, target: 15 },
    english: { completed: 7, target: 10 }
  };

  const overallProgress = 68;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1>Welcome back, Student!</h1>
        <p className="text-muted-foreground">Let's continue your NET preparation journey</p>
      </div>

      {/* Countdown Card */}
      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
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

      {/* Today's Target */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Today's Target
          </CardTitle>
          <CardDescription>Complete your daily practice goals</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span>Mathematics</span>
              <span className="text-sm text-muted-foreground">
                {todayProgress.mathematics.completed}/{todayProgress.mathematics.target} Questions
              </span>
            </div>
            <Progress value={(todayProgress.mathematics.completed / todayProgress.mathematics.target) * 100} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>Physics</span>
              <span className="text-sm text-muted-foreground">
                {todayProgress.physics.completed}/{todayProgress.physics.target} Questions
              </span>
            </div>
            <Progress value={(todayProgress.physics.completed / todayProgress.physics.target) * 100} />
          </div>
          <div>
            <div className="flex justify-between mb-2">
              <span>English</span>
              <span className="text-sm text-muted-foreground">
                {todayProgress.english.completed}/{todayProgress.english.target} Questions
              </span>
            </div>
            <Progress value={(todayProgress.english.completed / todayProgress.english.target) * 100} />
          </div>
        </CardContent>
      </Card>

      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Overall Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-3xl">{overallProgress}%</div>
          <Progress value={overallProgress} className="mb-2" />
          <p className="text-sm text-muted-foreground">Great progress! Keep it up!</p>
        </CardContent>
      </Card>

      {/* Quick Access */}
      <div>
        <h3 className="mb-4">Quick Access</h3>
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => onNavigate('preparation')}
          >
            <BookOpen className="w-6 h-6" />
            Start Practice
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => onNavigate('tests')}
          >
            <FileText className="w-6 h-6" />
            Mock Test
          </Button>
          <Button
            variant="outline"
            className="h-24 flex flex-col gap-2"
            onClick={() => onNavigate('ai-mentor')}
          >
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

      {/* Latest Updates */}
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
                <p>NET Series 2 registration opens on December 14</p>
                <p className="text-sm text-muted-foreground">Deadline: February 1, 2026</p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-2" />
              <div>
                <p>New mock test available: Full NET Engineering</p>
                <p className="text-sm text-muted-foreground">200 questions, 180 minutes</p>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
              <div>
                <p>AI Mentor updated with new solving techniques</p>
                <p className="text-sm text-muted-foreground">Try it now!</p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
