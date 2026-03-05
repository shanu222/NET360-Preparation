import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Calendar, CheckCircle, AlertCircle, Trophy } from 'lucide-react';

export function NUSTGuide() {
  const [sscMarks, setSscMarks] = useState('');
  const [hsscMarks, setHsscMarks] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<string[]>([]);

  const checkEligibility = () => {
    const ssc = parseFloat(sscMarks);
    const hssc = parseFloat(hsscMarks);
    
    const eligible = [];
    
    if (ssc >= 60 && hssc >= 60) {
      eligible.push('Engineering', 'Computing', 'Business Studies', 'Applied Sciences', 'Natural Sciences');
    } else if (ssc >= 50 && hssc >= 50) {
      eligible.push('Business Studies', 'Applied Sciences');
    }
    
    setEligibilityResult(eligible);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Complete NUST Admission Guide</h1>
        <p className="text-muted-foreground">Everything you need to know about NUST admissions</p>
      </div>

      <Tabs defaultValue="routes">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="routes">Entry Routes</TabsTrigger>
          <TabsTrigger value="policy">Admission Policy</TabsTrigger>
          <TabsTrigger value="dates">Important Dates</TabsTrigger>
          <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
        </TabsList>

        <TabsContent value="routes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Entry Routes to NUST</CardTitle>
              <CardDescription>Multiple pathways to join NUST</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3>NET (NUST Entry Test)</h3>
                  <Badge>Most Popular</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Computer-based test conducted by NUST. Available in multiple series throughout the year.
                  Valid for the admission cycle in which it is taken.
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Multiple attempts allowed
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Computer-based test
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    4 test series per year
                  </li>
                </ul>
              </div>

              <div className="p-4 border rounded-lg">
                <h3 className="mb-2">SAT (International)</h3>
                <p className="text-sm text-muted-foreground">
                  International students and Pakistani students can apply through SAT scores.
                  Minimum score requirements apply.
                </p>
              </div>

              <div className="p-4 border rounded-lg">
                <h3 className="mb-2">ACT (International)</h3>
                <p className="text-sm text-muted-foreground">
                  Alternative international admission route. ACT scores accepted with minimum requirements.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admission Policy</CardTitle>
              <CardDescription>Understanding NUST admission criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Trophy className="w-5 h-5 text-blue-500 mt-1" />
                  <div>
                    <h4>Merit-Based Admission</h4>
                    <p className="text-sm text-muted-foreground">
                      Admission is strictly merit-based. Your aggregate is calculated from SSC (10%), HSSC (15%),
                      and NET/SAT score (75%).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-green-500 mt-1" />
                  <div>
                    <h4>NET Validity</h4>
                    <p className="text-sm text-muted-foreground">
                      NET score is valid only for the admission cycle in which it is taken.
                      You cannot use previous year's NET score.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-purple-500 mt-1" />
                  <div>
                    <h4>Multiple Attempts</h4>
                    <p className="text-sm text-muted-foreground">
                      You can appear in multiple NET series. Your best score will be considered
                      for merit calculation.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-500 mt-1" />
                  <div>
                    <h4>Computer-Based Test</h4>
                    <p className="text-sm text-muted-foreground">
                      All NET tests are computer-based. Make sure to practice on computer
                      to get familiar with the interface.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <h4 className="mb-2">Aggregate Formula</h4>
                <div className="space-y-1 text-sm">
                  <p>Aggregate = (SSC% × 10) + (HSSC% × 15) + (NET Score × 75)</p>
                  <p className="text-muted-foreground">Maximum Aggregate: 100</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Important Dates - NET 2026</CardTitle>
              <CardDescription>Mark your calendar for these dates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="p-4 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
                  <div className="flex items-center justify-between mb-2">
                    <h4>NET Series 1</h4>
                    <Badge variant="secondary">Completed</Badge>
                  </div>
                  <p className="text-sm">Registration: October 5 - November 25, 2025</p>
                  <p className="text-sm text-muted-foreground">Test Date: December 2025</p>
                </div>

                <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-950">
                  <div className="flex items-center justify-between mb-2">
                    <h4>NET Series 2</h4>
                    <Badge className="bg-green-500">Open Soon</Badge>
                  </div>
                  <p className="text-sm">Registration: December 14, 2025 - February 1, 2026</p>
                  <p className="text-sm text-muted-foreground">Test Date: February 2026</p>
                </div>

                <div className="p-4 border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950">
                  <div className="flex items-center justify-between mb-2">
                    <h4>NET Series 3</h4>
                    <Badge variant="outline">Upcoming</Badge>
                  </div>
                  <p className="text-sm">Registration: February 22 - March 30, 2026</p>
                  <p className="text-sm text-muted-foreground">Test Date: April 2026</p>
                </div>

                <div className="p-4 border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950">
                  <div className="flex items-center justify-between mb-2">
                    <h4>NET Series 4</h4>
                    <Badge variant="outline">Upcoming</Badge>
                  </div>
                  <p className="text-sm">Registration: April - June 2026</p>
                  <p className="text-sm text-muted-foreground">Test Date: June 2026</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eligibility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Eligibility Checker</CardTitle>
              <CardDescription>Check which programs you're eligible for</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ssc-marks">SSC/Matric Percentage</Label>
                  <Input
                    id="ssc-marks"
                    type="number"
                    placeholder="e.g., 85"
                    value={sscMarks}
                    onChange={(e) => setSscMarks(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hssc-marks">HSSC/Intermediate Percentage</Label>
                  <Input
                    id="hssc-marks"
                    type="number"
                    placeholder="e.g., 82"
                    value={hsscMarks}
                    onChange={(e) => setHsscMarks(e.target.value)}
                  />
                </div>

                <Button onClick={checkEligibility}>Check Eligibility</Button>

                {eligibilityResult.length > 0 && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <h4 className="mb-3 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      You are eligible for:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {eligibilityResult.map((program) => (
                        <Badge key={program} className="bg-green-500">
                          {program}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {eligibilityResult.length === 0 && sscMarks && hsscMarks && (
                  <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                    <p className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                      Minimum 50% marks required in both SSC and HSSC
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t">
                <h4 className="mb-3">Minimum Requirements</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Engineering & Computing: 60% in SSC & HSSC</li>
                  <li>• Business Studies: 50% in SSC & HSSC</li>
                  <li>• Applied Sciences: 50% in SSC & HSSC with Science subjects</li>
                  <li>• Natural Sciences: 60% in SSC & HSSC with relevant subjects</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
