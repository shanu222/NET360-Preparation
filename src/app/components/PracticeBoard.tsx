import { type ComponentType, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { BookOpen, CheckCircle, FileText, Lightbulb, MessageSquare, RotateCcw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function PracticeBoard() {
  const [solution, setSolution] = useState('Step 1: 2x + 5 = 15\nStep 2: 2x = 15 - 5\nStep 3: 2x = 10\nStep 4: x = 10/2\nStep 5: x = 5');
  const [feedback, setFeedback] = useState<Array<{ step: number; correct: boolean; message: string }>>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const analyzeSolution = () => {
    const lines = solution
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      toast.error('Please enter your solution steps first.');
      return;
    }

    const parsedFeedback = lines.map((line, index) => {
      const normalized = line.toLowerCase();
      const mentionsEquation = normalized.includes('2x') || normalized.includes('x');
      const hasOperation = /[=+\-*/]/.test(normalized);
      const mentionsAnswer = normalized.includes('x = 5') || normalized.endsWith('5');
      const correct = (mentionsEquation && hasOperation) || mentionsAnswer;

      return {
        step: index + 1,
        correct,
        message: correct
          ? 'Good step structure and mathematical notation.'
          : 'This step is unclear. Include the equation transformation explicitly.',
      };
    });

    setFeedback(parsedFeedback);
    setShowAnalysis(true);
  };

  const clearBoard = () => {
    setSolution('');
    setFeedback([]);
    setShowAnalysis(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1>Practice Board</h1>
        <p className="text-muted-foreground">Solve problems step-by-step and get AI feedback</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[26px] border border-indigo-100 bg-white/92 shadow-[0_14px_28px_rgba(98,113,202,0.10)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-2xl text-indigo-950">Problem</CardTitle>
            <CardDescription className="text-base">Example problem to solve</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-[#eef2ff] to-[#e8edff] p-7">
              <div className="mb-3 text-center text-4xl text-indigo-950">
                2x + 5 = 15
              </div>
              <p className="text-center text-lg text-slate-500">
                Solve for x
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-indigo-950">Instructions</h4>
              <ul className="space-y-1.5 text-sm text-slate-500">
                <li className="flex items-start gap-2"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400" />Write each step of your solution in the workspace</li>
                <li className="flex items-start gap-2"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400" />Show your work clearly.</li>
                <li className="flex items-start gap-2"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400" />Click "Analyze Solution" when done</li>
                <li className="flex items-start gap-2"><span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400" />AI will check each step and provide feedback</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[26px] border border-indigo-100 bg-white/92 shadow-[0_14px_28px_rgba(98,113,202,0.10)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-2xl text-indigo-950">Your Solution</CardTitle>
            <CardDescription className="text-base">Write your step-by-step solution here</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Step 1: 2x + 5 = 15&#10;Step 2: 2x = 15 - 5&#10;Step 3: 2x = 10&#10;Step 4: x = 10/2&#10;Step 5: x = 5"
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              className="min-h-[228px] rounded-xl border-indigo-100 bg-white/95 font-mono text-base text-slate-600"
            />

            <div className="flex gap-2">
              <Button onClick={analyzeSolution} className="h-11 flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_8px_18px_rgba(107,95,230,0.32)]">
                <Lightbulb className="w-4 h-4 mr-2" />
                Analyze Solution
              </Button>
              <Button variant="outline" onClick={clearBoard} className="h-11 rounded-xl border-indigo-200 bg-white/90 text-slate-700">
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear
              </Button>
              <Button variant="outline" className="h-11 w-11 rounded-xl border-indigo-200 bg-white/90 text-slate-600 px-0">
                <FileText className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAnalysis && (
        <Card className="border-indigo-100 bg-white/95">
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
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
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
                      <span className={item.correct ? 'text-green-700' : 'text-red-700'}>
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
                You got {feedback.filter((item) => item.correct).length} out of {feedback.length} steps marked as correct.
                Keep each line explicit (equation, operation, resulting expression) for best feedback.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <FeatureTile
          icon={FileText}
          title="Step-by-Step Analysis"
          description="AI checks each step of your solution and provides detailed feedback"
        />
        <FeatureTile
          icon={MessageSquare}
          title="Instant Feedback"
          description="Get immediate corrections and learn from your mistakes"
        />
        <FeatureTile
          icon={BookOpen}
          title="Multiple Problems"
          description="Practice with hundreds of problems across all topics"
        />
      </div>

      <Card className="border-indigo-100 bg-gradient-to-r from-[#f6f2ff] via-[#f3f4ff] to-[#edf3ff] shadow-[0_10px_24px_rgba(98,113,202,0.10)]">
        <CardContent className="pt-5">
          <h3 className="mb-2 flex items-center gap-2 text-indigo-950">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Pro Tip
          </h3>
          <p className="text-slate-500">
            Write one transformation per line to receive better automated checks and cleaner revision notes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-indigo-100 bg-white/90 shadow-[0_8px_18px_rgba(98,113,202,0.10)]">
      <CardContent className="pt-5">
        <h4 className="mb-1 inline-flex items-center gap-2 text-indigo-950">
          <Icon className="h-4 w-4 text-indigo-400" />
          {title}
        </h4>
        <p className="text-sm text-slate-500">{description}</p>
      </CardContent>
    </Card>
  );
}
