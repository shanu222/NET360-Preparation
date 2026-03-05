import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Brain, MessageSquare, FileQuestion, Calendar, Send } from 'lucide-react';

export function AIMentor() {
  const [question, setQuestion] = useState('');
  const [studyDays, setStudyDays] = useState('60');
  const [currentLevel, setCurrentLevel] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([
    { role: 'ai', message: 'Hi! I\'m your AI tutor for NET preparation. How can I help you today?' }
  ]);

  const askQuestion = () => {
    if (!question.trim()) return;

    const userMessage = { role: 'user' as const, message: question };
    const aiResponse = {
      role: 'ai' as const,
      message: 'Integration by parts is a technique used to integrate products of functions. The formula is: ∫u dv = uv - ∫v du. Let me break this down with an example: To solve ∫x·e^x dx, let u = x and dv = e^x dx. Then du = dx and v = e^x. Applying the formula: ∫x·e^x dx = x·e^x - ∫e^x dx = x·e^x - e^x + C = e^x(x - 1) + C.'
    };

    setChatMessages([...chatMessages, userMessage, aiResponse]);
    setQuestion('');
  };

  const generateStudyPlan = () => {
    // Mock study plan generation
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2">
          <Brain className="w-8 h-8" />
          AI Mentor
        </h1>
        <p className="text-muted-foreground">Your personal AI tutor for NET preparation</p>
      </div>

      <Tabs defaultValue="chat">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="chat">Ask Doubt</TabsTrigger>
          <TabsTrigger value="solver">Question Solver</TabsTrigger>
          <TabsTrigger value="planner">Study Planner</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Chat with AI Tutor
              </CardTitle>
              <CardDescription>Ask any question about your preparation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {chatMessages.map((msg, index) => (
                    <div
                      key={index}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-4 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask your question here... e.g., Explain integration by parts"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="min-h-[60px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      askQuestion();
                    }
                  }}
                />
                <Button onClick={askQuestion} size="icon" className="self-end">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Topics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Integration Techniques
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Electromagnetism
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Organic Chemistry
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Trigonometric Identities
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Newton's Laws
                </Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                  Grammar Rules
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="solver" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileQuestion className="w-5 h-5" />
                Question Solver
              </CardTitle>
              <CardDescription>Upload a question and get step-by-step solution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <FileQuestion className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="mb-2">Upload a question image</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports JPG, PNG (Max 5MB)
                </p>
                <Button variant="outline">Choose File</Button>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="mb-2">Example Solution Format</h4>
                <div className="space-y-2 text-sm">
                  <p>1. <strong>Concept Explanation:</strong> Understanding what the question is asking</p>
                  <p>2. <strong>Step-by-Step Solution:</strong> Detailed solving process</p>
                  <p>3. <strong>Final Answer:</strong> Clear conclusion</p>
                  <p>4. <strong>Related Concepts:</strong> Similar topics to study</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-r from-green-500 to-teal-600 text-white border-0">
            <CardContent className="pt-6">
              <h3 className="mb-2 text-white">Premium Feature</h3>
              <p className="text-green-100 mb-4">
                Upload unlimited questions and get detailed AI solutions. Upgrade to premium for instant access!
              </p>
              <Button variant="secondary">Upgrade to Premium</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Smart Study Planner
              </CardTitle>
              <CardDescription>Get a personalized study plan based on your preparation level</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-date">Days Until NET</Label>
                <Input
                  id="test-date"
                  type="number"
                  placeholder="60"
                  value={studyDays}
                  onChange={(e) => setStudyDays(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prep-level">Current Preparation Level</Label>
                <Select value={currentLevel} onValueChange={setCurrentLevel}>
                  <SelectTrigger id="prep-level">
                    <SelectValue placeholder="Select your level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner - Just started</SelectItem>
                    <SelectItem value="intermediate">Intermediate - 30-50% done</SelectItem>
                    <SelectItem value="advanced">Advanced - 60-80% done</SelectItem>
                    <SelectItem value="revision">Revision - Final preparation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-program">Target Program</Label>
                <Select>
                  <SelectTrigger id="target-program">
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="engineering">Engineering</SelectItem>
                    <SelectItem value="computing">Computing</SelectItem>
                    <SelectItem value="business">Business Studies</SelectItem>
                    <SelectItem value="applied">Applied Sciences</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={generateStudyPlan} className="w-full">
                Generate Study Plan
              </Button>
            </CardContent>
          </Card>

          {currentLevel && studyDays && (
            <Card>
              <CardHeader>
                <CardTitle>Your 60-Day Study Plan</CardTitle>
                <CardDescription>Customized plan for {studyDays} days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4>Week 1-2: Foundation</h4>
                      <Badge>Days 1-14</Badge>
                    </div>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Mathematics: Algebra & Functions (4 hours/day)</li>
                      <li>• Physics: Mechanics (3 hours/day)</li>
                      <li>• English: Vocabulary building (1 hour/day)</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4>Week 3-4: Core Topics</h4>
                      <Badge>Days 15-28</Badge>
                    </div>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Mathematics: Calculus & Trigonometry (4 hours/day)</li>
                      <li>• Physics: Electricity & Waves (3 hours/day)</li>
                      <li>• English: Grammar & Comprehension (1 hour/day)</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4>Week 5-6: Advanced & Practice</h4>
                      <Badge>Days 29-42</Badge>
                    </div>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Complete remaining topics (3 hours/day)</li>
                      <li>• Start topic-wise tests (3 hours/day)</li>
                      <li>• Review weak areas (2 hours/day)</li>
                    </ul>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4>Week 7-8: Mock Tests & Revision</h4>
                      <Badge variant="secondary">Days 43-60</Badge>
                    </div>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• Full-length mock tests (2 per week)</li>
                      <li>• Formula revision (2 hours/day)</li>
                      <li>• Solve previous papers (3 hours/day)</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
