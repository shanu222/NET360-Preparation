import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Progress } from './ui/progress';
import { BookOpen, ChevronRight, CheckCircle, Circle } from 'lucide-react';

export function Preparation() {
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  const subjects = {
    mathematics: {
      chapters: [
        { name: 'Algebra', topics: 15, completed: 12, progress: 80 },
        { name: 'Functions', topics: 10, completed: 8, progress: 80 },
        { name: 'Trigonometry', topics: 12, completed: 10, progress: 83 },
        { name: 'Calculus', topics: 18, completed: 6, progress: 33 },
        { name: 'Analytical Geometry', topics: 14, completed: 5, progress: 36 },
        { name: 'Matrices & Determinants', topics: 8, completed: 0, progress: 0 },
        { name: 'Vectors', topics: 10, completed: 0, progress: 0 }
      ]
    },
    physics: {
      chapters: [
        { name: 'Mechanics', topics: 16, completed: 14, progress: 88 },
        { name: 'Waves & Oscillations', topics: 10, completed: 7, progress: 70 },
        { name: 'Electricity', topics: 14, completed: 8, progress: 57 },
        { name: 'Magnetism', topics: 12, completed: 4, progress: 33 },
        { name: 'Thermodynamics', topics: 8, completed: 0, progress: 0 },
        { name: 'Modern Physics', topics: 12, completed: 0, progress: 0 }
      ]
    },
    english: {
      chapters: [
        { name: 'Vocabulary', topics: 20, completed: 18, progress: 90 },
        { name: 'Grammar', topics: 15, completed: 12, progress: 80 },
        { name: 'Sentence Correction', topics: 12, completed: 10, progress: 83 },
        { name: 'Comprehension', topics: 10, completed: 6, progress: 60 },
        { name: 'Synonyms & Antonyms', topics: 8, completed: 5, progress: 63 }
      ]
    },
    biology: {
      chapters: [
        { name: 'Cell Biology', topics: 12, completed: 8, progress: 67 },
        { name: 'Genetics', topics: 14, completed: 6, progress: 43 },
        { name: 'Ecology', topics: 10, completed: 4, progress: 40 },
        { name: 'Human Physiology', topics: 16, completed: 2, progress: 13 },
        { name: 'Evolution', topics: 8, completed: 0, progress: 0 }
      ]
    },
    chemistry: {
      chapters: [
        { name: 'Organic Chemistry', topics: 18, completed: 12, progress: 67 },
        { name: 'Inorganic Chemistry', topics: 14, completed: 8, progress: 57 },
        { name: 'Physical Chemistry', topics: 16, completed: 10, progress: 63 },
        { name: 'Chemical Bonding', topics: 10, completed: 6, progress: 60 }
      ]
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Study materials organized by subject and chapter</p>
      </div>

      <Tabs defaultValue="mathematics">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="mathematics">Mathematics</TabsTrigger>
          <TabsTrigger value="physics">Physics</TabsTrigger>
          <TabsTrigger value="english">English</TabsTrigger>
          <TabsTrigger value="biology">Biology</TabsTrigger>
          <TabsTrigger value="chemistry">Chemistry</TabsTrigger>
        </TabsList>

        {Object.entries(subjects).map(([subject, data]) => (
          <TabsContent key={subject} value={subject} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="capitalize">{subject} Preparation</CardTitle>
                <CardDescription>
                  {data.chapters.length} chapters covering all topics for NET
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-3">
                    {data.chapters.map((chapter, index) => (
                      <div
                        key={index}
                        className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer"
                        onClick={() => setSelectedChapter(`${subject}-${index}`)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4>{chapter.name}</h4>
                              {chapter.completed === chapter.topics && (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {chapter.completed}/{chapter.topics} topics completed
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <Progress value={chapter.progress} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {selectedChapter?.startsWith(subject) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    {data.chapters[parseInt(selectedChapter.split('-')[1])].name}
                  </CardTitle>
                  <CardDescription>Study materials and practice questions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    <Button variant="outline" className="justify-start">
                      <Circle className="w-4 h-4 mr-2" />
                      Theory & Concepts
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Circle className="w-4 h-4 mr-2" />
                      Worked Examples
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Circle className="w-4 h-4 mr-2" />
                      Practice MCQs (50 Questions)
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Circle className="w-4 h-4 mr-2" />
                      Formula Sheet
                    </Button>
                    <Button variant="outline" className="justify-start">
                      <Circle className="w-4 h-4 mr-2" />
                      Quick Revision Notes
                    </Button>
                  </div>

                  <div className="pt-4 border-t">
                    <Button className="w-full">Start Practicing</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Study Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">1</Badge>
              <span>Start with theory and understand core concepts before attempting MCQs</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">2</Badge>
              <span>Practice worked examples to understand problem-solving approaches</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">3</Badge>
              <span>Complete at least 50 MCQs per chapter for thorough practice</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="mt-0.5">4</Badge>
              <span>Revise formula sheets regularly and memorize key formulas</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
