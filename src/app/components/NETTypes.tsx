import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Building2, Code, Briefcase, Ruler, Beaker } from 'lucide-react';

export function NETTypes() {
  const netTypes = [
    {
      name: 'NET Engineering',
      icon: Building2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      subjects: [
        { name: 'Mathematics', percentage: 50, questions: 100 },
        { name: 'Physics', percentage: 30, questions: 60 },
        { name: 'English', percentage: 20, questions: 40 }
      ],
      usedFor: ['Engineering', 'Computing'],
      totalQuestions: 200,
      duration: 180
    },
    {
      name: 'NET Applied Sciences',
      icon: Beaker,
      color: 'text-teal-500',
      bgColor: 'bg-teal-50 dark:bg-teal-950',
      subjects: [
        { name: 'Biology', percentage: 50, questions: 100 },
        { name: 'Chemistry', percentage: 30, questions: 60 },
        { name: 'English', percentage: 20, questions: 40 }
      ],
      usedFor: ['Applied Sciences', 'Biotechnology', 'Environmental Science'],
      totalQuestions: 200,
      duration: 180
    },
    {
      name: 'NET Business',
      icon: Briefcase,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950',
      subjects: [
        { name: 'Quantitative Math', percentage: 50, questions: 100 },
        { name: 'English', percentage: 50, questions: 100 }
      ],
      usedFor: ['Business Studies', 'Economics', 'Social Sciences'],
      totalQuestions: 200,
      duration: 180
    },
    {
      name: 'NET Architecture',
      icon: Ruler,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950',
      subjects: [
        { name: 'Design Aptitude', percentage: 50, questions: 100 },
        { name: 'Mathematics', percentage: 30, questions: 60 },
        { name: 'English', percentage: 20, questions: 40 }
      ],
      usedFor: ['Architecture', 'Industrial Design'],
      totalQuestions: 200,
      duration: 180
    },
    {
      name: 'NET Natural Sciences',
      icon: Beaker,
      color: 'text-pink-500',
      bgColor: 'bg-pink-50 dark:bg-pink-950',
      subjects: [
        { name: 'Mathematics', percentage: 50, questions: 100 },
        { name: 'English', percentage: 50, questions: 100 }
      ],
      usedFor: ['Mathematics', 'Physics', 'Chemistry'],
      totalQuestions: 200,
      duration: 180
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1>NET Test Types</h1>
        <p className="text-muted-foreground">Understand the structure of different NET tests</p>
      </div>

      <div className="grid gap-6">
        {netTypes.map((net, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <net.icon className={`w-5 h-5 ${net.color}`} />
                {net.name}
              </CardTitle>
              <CardDescription>
                {net.totalQuestions} Questions • {net.duration} Minutes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="mb-3">Subject Distribution</h4>
                <div className="space-y-3">
                  {net.subjects.map((subject, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between mb-2">
                        <span>{subject.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {subject.percentage}% ({subject.questions} questions)
                        </span>
                      </div>
                      <Progress value={subject.percentage} />
                    </div>
                  ))}
                </div>
              </div>

              <div className={`p-4 ${net.bgColor} rounded-lg`}>
                <h4 className="mb-2">Used For</h4>
                <div className="flex flex-wrap gap-2">
                  {net.usedFor.map((program) => (
                    <Badge key={program} className={net.color}>
                      {program}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Total Questions</p>
                  <p>{net.totalQuestions}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p>{net.duration} mins</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Per Question</p>
                  <p>~54 seconds</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Important Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>All NET tests are computer-based and conducted at designated test centers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>Each question carries equal marks with negative marking for incorrect answers</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>You can appear in multiple test series and your best score will be considered</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>Calculator is not allowed; all calculations must be done mentally or on scratch paper</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
