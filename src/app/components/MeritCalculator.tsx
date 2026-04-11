import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Calculator, Info, Lightbulb } from 'lucide-react';

export function MeritCalculator() {
  const [sscMarks, setSscMarks] = useState('');
  const [hsscMarks, setHsscMarks] = useState('');
  const [netScore, setNetScore] = useState('');
  const [aggregate, setAggregate] = useState<number | null>(null);
  const [meritPosition, setMeritPosition] = useState<string | null>(null);

  const calculateMerit = () => {
    const sscValue = parseFloat(sscMarks);
    const hsscValue = parseFloat(hsscMarks);
    const netValue = parseFloat(netScore);

    if (Number.isNaN(sscValue) || Number.isNaN(hsscValue) || Number.isNaN(netValue)) {
      return;
    }

    if (sscValue > 100 || hsscValue > 100 || netValue > 200) {
      console.warn('Invalid input range');
      return;
    }

    const result = sscValue * 0.1 + hsscValue * 0.15 + (netValue / 2) * 0.75;
    const finalAggregate = Math.min(result, 100);
    setAggregate(finalAggregate);

    if (finalAggregate >= 85) {
      setMeritPosition('Excellent - Top 500');
    } else if (finalAggregate >= 75) {
      setMeritPosition('Very Good - Top 1500');
    } else if (finalAggregate >= 65) {
      setMeritPosition('Good - Top 3000');
    } else {
      setMeritPosition('Fair - Top 5000');
    }
  };

  const reset = () => {
    setSscMarks('');
    setHsscMarks('');
    setNetScore('');
    setAggregate(null);
    setMeritPosition(null);
  };

  const programMerits = [
    { program: 'Computer Science (SEECS)', lastMerit: 86.5, color: 'text-indigo-700' },
    { program: 'Electrical Engineering (SEECS)', lastMerit: 84.2, color: 'text-indigo-700' },
    { program: 'Artificial Intelligence', lastMerit: 87.1, color: 'text-indigo-700' },
    { program: 'Software Engineering', lastMerit: 85.8, color: 'text-indigo-700' },
    { program: 'Mechanical Engineering (SMME)', lastMerit: 82.5, color: 'text-indigo-700' },
    { program: 'Civil Engineering (SCEE)', lastMerit: 78.9, color: 'text-indigo-700' },
    { program: 'BBA', lastMerit: 76.4, color: 'text-indigo-700' },
    { program: 'Data Science', lastMerit: 86.2, color: 'text-indigo-700' },
  ];

  const leftMerits = programMerits.filter((_, index) => index % 2 === 0);
  const rightMerits = programMerits.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2">
          <Calculator className="w-7 h-7" />
          Merit Calculator
        </h1>
        <p className="text-muted-foreground">Calculate your expected aggregate and merit position</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="rounded-2xl border-indigo-100 bg-white/92">
          <CardHeader>
            <CardTitle>Calculate Your Merit</CardTitle>
            <CardDescription>Enter your marks to calculate aggregate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ssc">SSC/Matric Percentage</Label>
                <Input
                  id="ssc"
                  type="number"
                  placeholder="Eg. 85"
                  value={sscMarks}
                  onChange={(e) => setSscMarks(e.target.value)}
                  min="0"
                  max="100"
                  className="border-indigo-100"
                />
                <p className="text-xs text-slate-500">Weightage: 10%</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hssc">HSSC/Intermediate Percentage</Label>
                <Input
                  id="hssc"
                  type="number"
                  placeholder="Eg. 85"
                  value={hsscMarks}
                  onChange={(e) => setHsscMarks(e.target.value)}
                  min="0"
                  max="100"
                  className="border-indigo-100"
                />
                <p className="text-xs text-slate-500">Weightage: 15%</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="net">NET Score (out of 200)</Label>
                <Input
                  id="net"
                  type="number"
                  placeholder="Eg. 144"
                  value={netScore}
                  onChange={(e) => setNetScore(e.target.value)}
                  min="0"
                  max="200"
                  className="border-indigo-100"
                />
                <p className="text-xs text-slate-500">Weightage: 75%</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <Button onClick={calculateMerit} className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white">
                Calculate
              </Button>
              <Button onClick={reset} variant="outline" className="border-indigo-200 bg-white text-slate-700">
                Reset
              </Button>
            </div>

            <div className="rounded-lg border border-indigo-100 bg-[#f2f5ff] px-3 py-2">
              <p className="text-sm text-slate-600 inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-indigo-500" />
                <span className="font-medium text-indigo-900">Formula</span>
                Aggregate = (SSC% × 0.10) + (HSSC% × 0.15) + ((NET Score ÷ 2) × 0.75)
              </p>
              <p className="mt-1 text-xs text-slate-500">Maximum: 100</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-indigo-100 bg-white/92">
          <CardHeader>
            <CardTitle>Your Result</CardTitle>
            <CardDescription>Calculated aggregate and merit prediction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[15px] text-slate-700">Aggregate:</p>
              <p className="text-3xl text-indigo-950 sm:text-4xl">{aggregate !== null ? aggregate.toFixed(2) : '-- --'}</p>
            </div>

            <div>
              <p className="text-[15px] text-slate-700">Merit Position: {meritPosition || '-- --'}</p>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-[#f5f7ff] to-[#edf2ff] p-5 text-sm text-slate-500">
              Enter your marks and click Calculate to see your merit.
            </div>

            {aggregate !== null ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Estimated Aggregate: {aggregate.toFixed(2)}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/92">
        <CardHeader>
          <CardTitle>Last Year&apos;s Closing Merits</CardTitle>
          <CardDescription>Reference merits for popular programs (2023 data)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-100 bg-white">
              {leftMerits.map((program, index) => (
                <div
                  key={program.program}
                  className={`flex items-center justify-between px-3 py-2 ${
                    index !== leftMerits.length - 1 ? 'border-b border-indigo-100' : ''
                  }`}
                >
                  <p className={program.color}>{program.program}</p>
                  <div className="text-right text-indigo-950">{program.lastMerit}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-indigo-100 bg-white">
              {rightMerits.map((program, index) => (
                <div
                  key={program.program}
                  className={`flex items-center justify-between px-3 py-2 ${
                    index !== rightMerits.length - 1 ? 'border-b border-indigo-100' : ''
                  }`}
                >
                  <p className={program.color}>{program.program}</p>
                  <div className="text-right text-indigo-950">{program.lastMerit}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <h4 className="mb-1 inline-flex items-center gap-2 text-amber-700">
              <Lightbulb className="h-4 w-4" />
              Important Note
            </h4>
            <p className="text-sm text-slate-600">
              Minimum merits vary each year based on applicant pool and available seats. These are reference values
              from last year and actual requirements may differ.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
