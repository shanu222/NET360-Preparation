import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Calculator, TrendingUp, AlertCircle, Trophy } from 'lucide-react';

export function MeritCalculator() {
  const [sscMarks, setSscMarks] = useState('');
  const [hsscMarks, setHsscMarks] = useState('');
  const [netScore, setNetScore] = useState('');
  const [aggregate, setAggregate] = useState<number | null>(null);
  const [meritPosition, setMeritPosition] = useState<string | null>(null);

  const calculateMerit = () => {
    const ssc = parseFloat(sscMarks);
    const hssc = parseFloat(hsscMarks);
    const net = parseFloat(netScore);

    if (isNaN(ssc) || isNaN(hssc) || isNaN(net)) {
      return;
    }

    // Formula: Aggregate = (SSC% × 10) + (HSSC% × 15) + (NET Score × 75)
    const calculatedAggregate = (ssc * 0.1) + (hssc * 0.15) + (net * 0.75);
    setAggregate(calculatedAggregate);

    // Mock merit position calculation
    if (calculatedAggregate >= 85) {
      setMeritPosition('Excellent - Top 500');
    } else if (calculatedAggregate >= 75) {
      setMeritPosition('Very Good - Top 1500');
    } else if (calculatedAggregate >= 65) {
      setMeritPosition('Good - Top 3000');
    } else {
      setMeritPosition('Fair - Top 5000');
    }
  };

  const programMerits = [
    { program: 'Computer Science (SEECS)', lastMerit: 86.5, color: 'text-blue-500' },
    { program: 'Electrical Engineering (SEECS)', lastMerit: 84.2, color: 'text-purple-500' },
    { program: 'Artificial Intelligence', lastMerit: 87.1, color: 'text-pink-500' },
    { program: 'Software Engineering', lastMerit: 85.8, color: 'text-teal-500' },
    { program: 'Mechanical Engineering (SMME)', lastMerit: 82.5, color: 'text-green-500' },
    { program: 'Civil Engineering (SCEE)', lastMerit: 78.9, color: 'text-orange-500' },
    { program: 'BBA', lastMerit: 76.4, color: 'text-yellow-500' },
    { program: 'Data Science', lastMerit: 86.2, color: 'text-indigo-500' }
  ];

  const reset = () => {
    setSscMarks('');
    setHsscMarks('');
    setNetScore('');
    setAggregate(null);
    setMeritPosition(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2">
          <Calculator className="w-8 h-8" />
          Merit Calculator
        </h1>
        <p className="text-muted-foreground">Calculate your expected aggregate and merit position</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Calculate Your Merit</CardTitle>
            <CardDescription>Enter your marks to calculate aggregate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ssc">SSC/Matric Percentage</Label>
              <Input
                id="ssc"
                type="number"
                placeholder="e.g., 85"
                value={sscMarks}
                onChange={(e) => setSscMarks(e.target.value)}
                min="0"
                max="100"
              />
              <p className="text-xs text-muted-foreground">Weightage: 10%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="hssc">HSSC/Intermediate Percentage</Label>
              <Input
                id="hssc"
                type="number"
                placeholder="e.g., 82"
                value={hsscMarks}
                onChange={(e) => setHsscMarks(e.target.value)}
                min="0"
                max="100"
              />
              <p className="text-xs text-muted-foreground">Weightage: 15%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="net">NET Score (Percentage)</Label>
              <Input
                id="net"
                type="number"
                placeholder="e.g., 78"
                value={netScore}
                onChange={(e) => setNetScore(e.target.value)}
                min="0"
                max="100"
              />
              <p className="text-xs text-muted-foreground">Weightage: 75%</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={calculateMerit} className="flex-1">
                Calculate
              </Button>
              <Button onClick={reset} variant="outline">
                Reset
              </Button>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Formula
              </h4>
              <p className="text-sm text-muted-foreground">
                Aggregate = (SSC% × 10) + (HSSC% × 15) + (NET Score × 75)
              </p>
              <p className="text-sm text-muted-foreground mt-1">Maximum: 100</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your Result</CardTitle>
            <CardDescription>Calculated aggregate and merit prediction</CardDescription>
          </CardHeader>
          <CardContent>
            {aggregate !== null ? (
              <div className="space-y-6">
                <div className="text-center p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg">
                  <p className="text-sm mb-2 text-blue-100">Your Aggregate</p>
                  <div className="text-5xl mb-2">{aggregate.toFixed(2)}</div>
                  <p className="text-sm text-blue-100">out of 100</p>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    <h4>Merit Position</h4>
                  </div>
                  <Badge className="mb-3 bg-green-500">{meritPosition}</Badge>
                  <Progress value={aggregate} className="mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Based on previous year's data
                  </p>
                </div>

                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <h4 className="mb-2">Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SSC Contribution:</span>
                      <span>{(parseFloat(sscMarks) * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HSSC Contribution:</span>
                      <span>{(parseFloat(hsscMarks) * 0.15).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">NET Contribution:</span>
                      <span>{(parseFloat(netScore) * 0.75).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span>Total Aggregate:</span>
                      <span>{aggregate.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Improvement Tips
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Focus on NET as it has 75% weightage</li>
                    <li>• Every 1% increase in NET = 0.75 points in aggregate</li>
                    <li>• Aim for at least 80% in NET for top programs</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calculator className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Enter your marks and click Calculate to see your merit</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Program Merit List */}
      <Card>
        <CardHeader>
          <CardTitle>Last Year's Closing Merits</CardTitle>
          <CardDescription>Reference merits for popular programs (2025 data)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {programMerits.map((program, index) => (
              <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <h4 className={program.color}>{program.program}</h4>
                  <div className="text-right">
                    <div className="text-xl">{program.lastMerit}</div>
                    <p className="text-xs text-muted-foreground">Closing Merit</p>
                  </div>
                </div>
                {aggregate !== null && (
                  <div>
                    {aggregate >= program.lastMerit ? (
                      <Badge className="bg-green-500">Likely Admission</Badge>
                    ) : aggregate >= program.lastMerit - 2 ? (
                      <Badge className="bg-yellow-500">Borderline</Badge>
                    ) : (
                      <Badge variant="destructive">Need Improvement</Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
            <h4 className="mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Important Note
            </h4>
            <p className="text-sm text-muted-foreground">
              Merit requirements vary each year based on applicant pool and available seats.
              These are reference values from last year and actual requirements may differ.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
