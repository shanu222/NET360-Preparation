import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { CheckCircle, XCircle, Lightbulb, Eraser } from 'lucide-react';

export function PracticeBoard() {
  const [solution, setSolution] = useState('');
  const [feedback, setFeedback] = useState<Array<{ step: number; correct: boolean; message: string }>>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const analyzeSolution = () => {
    // Simulated AI analysis
    const mockFeedback = [
      { step: 1, correct: true, message: 'Correctly identified the equation and isolated the variable term' },
      { step: 2, correct: true, message: 'Proper subtraction of 5 from both sides' },
      { step: 3, correct: false, message: 'Division step has an error. You should divide both sides by 2' },
      { step: 4, correct: true, message: 'Final answer is correct: x = 5' }
    ];
    
    setFeedback(mockFeedback);
    setShowAnalysis(true);
  };

  const clearBoard = () => {
    setSolution('');
    setFeedback([]);
    setShowAnalysis(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Practice Board</h1>
        <p className="text-muted-foreground">Solve problems step-by-step and get AI feedback</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Problem</CardTitle>
            <CardDescription>Example problem to solve</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-6 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="text-center text-2xl mb-4">
                2x + 5 = 15
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Solve for x
              </p>
            </div>

            <div className="space-y-2">
              <h4>Instructions</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Write each step of your solution in the workspace</li>
                <li>• Show your work clearly</li>
                <li>• Click "Analyze Solution" when done</li>
                <li>• AI will check each step and provide feedback</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Solution</CardTitle>
            <CardDescription>Write your step-by-step solution here</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Step 1: 2x + 5 = 15&#10;Step 2: 2x = 15 - 5&#10;Step 3: 2x = 10&#10;Step 4: x = 10/2&#10;Step 5: x = 5"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              className="min-h-[200px] font-mono"
            />

            <div className="flex gap-2">
              <Button onClick={analyzeSolution} className="flex-1">
                <Lightbulb className="w-4 h-4 mr-2" />
                Analyze Solution
              </Button>
              <Button variant="outline" onClick={clearBoard}>
                <Eraser className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              AI Analysis
            </CardTitle>
            <CardDescription>Step-by-step feedback on your solution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.map((item, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  item.correct
                    ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {item.correct ? (
                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={item.correct ? 'default' : 'destructive'}>
                        Step {item.step}
                      </Badge>
                      <span className={item.correct ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                        {item.correct ? 'Correct' : 'Needs Improvement'}
                      </span>
                    </div>
                    <p className="text-sm">{item.message}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <h4>Overall Performance</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                You got 3 out of 4 steps correct. Review the division step and try again.
                Remember to clearly show all operations on both sides of the equation.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="mb-2">Step-by-Step Analysis</h4>
              <p className="text-sm text-muted-foreground">
                AI checks each step of your solution and provides detailed feedback
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="mb-2">Instant Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Get immediate corrections and learn from your mistakes
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="mb-2">Multiple Problems</h4>
              <p className="text-sm text-muted-foreground">
                Practice with hundreds of problems across all topics
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-r from-purple-500 to-blue-600 text-white border-0">
        <CardContent className="pt-6">
          <h3 className="mb-2 text-white">Pro Tip</h3>
          <p className="text-blue-100">
            This Practice Board supports handwriting recognition (coming soon). You'll be able to
            draw your solutions and equations directly on screen, just like writing on paper!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
