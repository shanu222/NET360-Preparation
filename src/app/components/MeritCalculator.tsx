import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Calculator, Info, Lightbulb } from 'lucide-react';

type InputMode = 'marks' | 'percentage';

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function MeritCalculator() {
  const [mode, setMode] = useState<InputMode>('marks');

  /** FSc — marks */
  const [obtainedMatric, setObtainedMatric] = useState('');
  const [totalMatric, setTotalMatric] = useState('');
  const [obtainedFsc, setObtainedFsc] = useState('');
  const [totalFsc, setTotalFsc] = useState('');
  const [obtainedNet, setObtainedNet] = useState('');
  const [totalNet, setTotalNet] = useState('');
  /** FSc — percentage */
  const [matricPercentage, setMatricPercentage] = useState('');
  const [fscPercentage, setFscPercentage] = useState('');
  const [netPercentage, setNetPercentage] = useState('');

  /** A-Level — marks */
  const [obtainedMatricEq, setObtainedMatricEq] = useState('');
  const [totalMatricEq, setTotalMatricEq] = useState('');
  const [alObtainedNet, setAlObtainedNet] = useState('');
  const [alTotalNet, setAlTotalNet] = useState('');
  /** A-Level — percentage */
  const [matricEqPercentage, setMatricEqPercentage] = useState('');
  const [alNetPercentage, setAlNetPercentage] = useState('');

  const [fscAggregate, setFscAggregate] = useState<number | null>(null);
  const [aLevelAggregate, setALevelAggregate] = useState<number | null>(null);
  const [meritPosition, setMeritPosition] = useState<string | null>(null);

  const calculateFscAggregate = () => {
    let matricPercent: number;
    let fscPercent: number;
    let netPercent: number;

    if (mode === 'marks') {
      const om = parseNum(obtainedMatric);
      const tm = parseNum(totalMatric);
      const of = parseNum(obtainedFsc);
      const tf = parseNum(totalFsc);
      const on = parseNum(obtainedNet);
      const tn = parseNum(totalNet);

      if ([om, tm, of, tf, on, tn].some((x) => Number.isNaN(x))) return;
      if (tm <= 0 || tf <= 0 || tn <= 0) return;
      if (om > tm || of > tf || on > tn) return;

      matricPercent = (om / tm) * 100;
      fscPercent = (of / tf) * 100;
      netPercent = (on / tn) * 100;
    } else {
      matricPercent = parseFloat(matricPercentage) || 0;
      fscPercent = parseFloat(fscPercentage) || 0;
      netPercent = parseFloat(netPercentage) || 0;
      if (matricPercent > 100 || fscPercent > 100 || netPercent > 100) {
        console.warn('Invalid input range');
        return;
      }
    }

    const aggregate = matricPercent * 0.1 + fscPercent * 0.15 + netPercent * 0.75;
    setFscAggregate(aggregate);

    if (aggregate >= 85) {
      setMeritPosition('Excellent - Top 500');
    } else if (aggregate >= 75) {
      setMeritPosition('Very Good - Top 1500');
    } else if (aggregate >= 65) {
      setMeritPosition('Good - Top 3000');
    } else {
      setMeritPosition('Fair - Top 5000');
    }
  };

  const calculateALevelAggregate = () => {
    let matricP: number;
    let netP: number;

    if (mode === 'marks') {
      const ome = parseNum(obtainedMatricEq);
      const tme = parseNum(totalMatricEq);
      const on = parseNum(alObtainedNet);
      const tn = parseNum(alTotalNet);

      if ([ome, tme, on, tn].some((x) => Number.isNaN(x))) return;
      if (tme <= 0 || tn <= 0) return;
      if (ome > tme || on > tn) return;

      matricP = (ome / tme) * 100;
      netP = (on / tn) * 100;
    } else {
      matricP = parseFloat(matricEqPercentage) || 0;
      netP = parseFloat(alNetPercentage) || 0;
      if (matricP > 100 || netP > 100) {
        console.warn('Invalid input range');
        return;
      }
    }

    const aggregate = matricP * 0.25 + netP * 0.75;
    setALevelAggregate(aggregate);
  };

  const reset = () => {
    setObtainedMatric('');
    setTotalMatric('');
    setObtainedFsc('');
    setTotalFsc('');
    setObtainedNet('');
    setTotalNet('');
    setMatricPercentage('');
    setFscPercentage('');
    setNetPercentage('');
    setObtainedMatricEq('');
    setTotalMatricEq('');
    setAlObtainedNet('');
    setAlTotalNet('');
    setMatricEqPercentage('');
    setAlNetPercentage('');
    setFscAggregate(null);
    setALevelAggregate(null);
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

  const selectClass =
    'flex min-h-11 w-full max-w-full rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:max-w-xs md:max-w-sm';

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
        <div className="space-y-4 min-w-0">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>FSc Merit Calculator</CardTitle>
                  <CardDescription>Matric, FSc &amp; NET (NUST weighting)</CardDescription>
                </div>
                <div className="space-y-1.5 shrink-0">
                  <Label htmlFor="input-mode">Input mode</Label>
                  <select
                    id="input-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as InputMode)}
                    className={selectClass}
                  >
                    <option value="marks">Marks-Based</option>
                    <option value="percentage">Percentage-Based</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === 'marks' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-600">Matric</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="obtained-matric">Obtained marks</Label>
                        <Input
                          id="obtained-matric"
                          type="number"
                          min="0"
                          value={obtainedMatric}
                          onChange={(e) => setObtainedMatric(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="total-matric">Total marks</Label>
                        <Input
                          id="total-matric"
                          type="number"
                          min="0"
                          value={totalMatric}
                          onChange={(e) => setTotalMatric(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-600">FSc (Intermediate)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="obtained-fsc">Obtained marks</Label>
                        <Input
                          id="obtained-fsc"
                          type="number"
                          min="0"
                          value={obtainedFsc}
                          onChange={(e) => setObtainedFsc(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="total-fsc">Total marks</Label>
                        <Input
                          id="total-fsc"
                          type="number"
                          min="0"
                          value={totalFsc}
                          onChange={(e) => setTotalFsc(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-600">NET</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="obtained-net">Obtained marks</Label>
                        <Input
                          id="obtained-net"
                          type="number"
                          min="0"
                          value={obtainedNet}
                          onChange={(e) => setObtainedNet(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="total-net">Total marks</Label>
                        <Input
                          id="total-net"
                          type="number"
                          min="0"
                          value={totalNet}
                          onChange={(e) => setTotalNet(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="matric-pct">Matric %</Label>
                    <Input
                      id="matric-pct"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Eg. 85"
                      value={matricPercentage}
                      onChange={(e) => setMatricPercentage(e.target.value)}
                      className="border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Weightage: 10%</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fsc-pct">FSc %</Label>
                    <Input
                      id="fsc-pct"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Eg. 85"
                      value={fscPercentage}
                      onChange={(e) => setFscPercentage(e.target.value)}
                      className="border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Weightage: 15%</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="net-pct">NET %</Label>
                    <Input
                      id="net-pct"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Eg. 78"
                      value={netPercentage}
                      onChange={(e) => setNetPercentage(e.target.value)}
                      className="border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Weightage: 75%</p>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={calculateFscAggregate}
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
              >
                Calculate FSc aggregate
              </Button>

              <div className="rounded-lg border border-indigo-100 bg-[#f2f5ff] px-3 py-2">
                <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-indigo-500" />
                  <span className="font-medium text-indigo-900">Formula (FSc)</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Aggregate = (Matric% × 0.10) + (FSc% × 0.15) + (NET% × 0.75)
                </p>
                <p className="mt-1 text-xs text-slate-500">Percentages may come from marks (obtained ÷ total × 100) or direct entry.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle>A-Level Merit Calculator</CardTitle>
              <CardDescription>Uses the same input mode as above (marks or percentage)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === 'marks' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-600">Matric equivalence</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="obtained-meq">Obtained marks</Label>
                        <Input
                          id="obtained-meq"
                          type="number"
                          min="0"
                          value={obtainedMatricEq}
                          onChange={(e) => setObtainedMatricEq(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="total-meq">Total marks</Label>
                        <Input
                          id="total-meq"
                          type="number"
                          min="0"
                          value={totalMatricEq}
                          onChange={(e) => setTotalMatricEq(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <p className="text-xs font-medium text-slate-600">NET</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="al-obtained-net">Obtained marks</Label>
                        <Input
                          id="al-obtained-net"
                          type="number"
                          min="0"
                          value={alObtainedNet}
                          onChange={(e) => setAlObtainedNet(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="al-total-net">Total marks</Label>
                        <Input
                          id="al-total-net"
                          type="number"
                          min="0"
                          value={alTotalNet}
                          onChange={(e) => setAlTotalNet(e.target.value)}
                          className="border-indigo-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="meq-pct">Matric equivalence %</Label>
                    <Input
                      id="meq-pct"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Eg. 85"
                      value={matricEqPercentage}
                      onChange={(e) => setMatricEqPercentage(e.target.value)}
                      className="border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Weightage: 25%</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="al-net-pct">NET %</Label>
                    <Input
                      id="al-net-pct"
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Eg. 78"
                      value={alNetPercentage}
                      onChange={(e) => setAlNetPercentage(e.target.value)}
                      className="border-indigo-100"
                    />
                    <p className="text-xs text-slate-500">Weightage: 75%</p>
                  </div>
                </div>
              )}

              <Button
                type="button"
                onClick={calculateALevelAggregate}
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
              >
                Calculate A-Level aggregate
              </Button>

              <div className="rounded-lg border border-indigo-100 bg-[#f2f5ff] px-3 py-2">
                <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-indigo-500" />
                  <span className="font-medium text-indigo-900">Formula (A-Level)</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Aggregate = (Matric Equivalence% × 0.25) + (NET% × 0.75)
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button onClick={reset} variant="outline" className="border-indigo-200 bg-white text-slate-700 sm:col-span-2">
              Reset all
            </Button>
          </div>
        </div>

        <Card className="rounded-2xl border-indigo-100 bg-white/92 h-fit">
          <CardHeader>
            <CardTitle>Your Result</CardTitle>
            <CardDescription>Calculated aggregates and merit prediction (FSc)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-[15px] text-slate-700">FSc</p>
              <p className="text-xl font-semibold text-indigo-950 sm:text-2xl">
                Your Aggregate: {fscAggregate !== null ? `${fscAggregate.toFixed(2)}%` : '—'}
              </p>
            </div>

            <div>
              <p className="text-[15px] text-slate-700">A-Level</p>
              <p className="text-xl font-semibold text-indigo-950 sm:text-2xl">
                Your Aggregate: {aLevelAggregate !== null ? `${aLevelAggregate.toFixed(2)}%` : '—'}
              </p>
            </div>

            <div>
              <p className="text-[15px] text-slate-700">Merit Position (FSc): {meritPosition || '—'}</p>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-[#f5f7ff] to-[#edf2ff] p-5 text-sm text-slate-500">
              Enter values and use Calculate on each track (FSc / A-Level). Merit bands apply to the FSc aggregate.
            </div>

            {fscAggregate !== null ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                FSc — Estimated aggregate: {fscAggregate.toFixed(2)}%
              </div>
            ) : null}
            {aLevelAggregate !== null ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                A-Level — Estimated aggregate: {aLevelAggregate.toFixed(2)}%
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
