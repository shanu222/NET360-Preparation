import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../lib/api';
import {
  catalogClosingMerits,
  DEFAULT_CLOSING_MERIT_YEAR,
  formatClosingMerit,
  formatMeritPosition,
  mergeClosingMeritPrograms,
  meritPositionLabel,
  meritStatusLabel,
  standingOnClosingMeritList,
  type ClosingMeritProgram,
  type MeritListStanding,
} from '../lib/closingMerits';
import { isNativeAndroidRuntime } from '../lib/nativeForeground';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { openOrSaveBlobOnDevice } from '../lib/nativeFileAccess';
import { buildMeritResultPdf } from '../lib/meritResultPdf';
import { Calculator, Download, Info, Lightbulb } from 'lucide-react';

type InputMode = 'marks' | 'percentage';

const MERIT_GROUP_LABELS: Record<string, string> = {
  engineering: 'Engineering',
  computing: 'Computing',
  business: 'Business',
  architecture: 'Architecture',
  sciences: 'Sciences',
  applied: 'Applied',
};

function MobileFold({ title, children }: { title: string; children: ReactNode }) {
  if (!isNativeAndroidRuntime()) return <>{children}</>;
  return (
    <details className="net360-fold" open>
      <summary>{title}</summary>
      <div className="net360-fold-body">{children}</div>
    </details>
  );
}

function PotentialPrograms({ year, programs }: { year: number; programs: ClosingMeritProgram[] }) {
  return (
    <div className="pt-1">
      <p className="font-semibold text-indigo-950">Potential programs ({programs.length})</p>
      <p className="text-xs text-slate-500">
        {year} closing-merit list. These are the NUST programs whose closing aggregate this result meets.
      </p>
      {programs.length === 0 ? (
        <p className="mt-1">No listed program is within this aggregate.</p>
      ) : (
        <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
          {programs.map((program) => (
            <li key={program.id} className="rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5">
              <p className="font-medium text-indigo-800">{program.name}</p>
              <p className="text-xs text-slate-500">
                {program.institution}
                {program.location ? ` · ${program.location}` : ''}
                {' · '}Closing {formatClosingMerit(program.closingMerit)}
                {program.meritPosition != null ? ` · Position ${formatMeritPosition(program.meritPosition)}` : ''}
                {' · '}{meritStatusLabel(program.meritStatus)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrackOutcome({ label, year, standing }: { label: string; year: number; standing: MeritListStanding }) {
  const best = standing.bestMet;
  const next = standing.nextAbove;
  return (
    <div className="space-y-1">
      <p className="font-semibold text-indigo-950">{label}</p>
      <p>Merit position: {meritPositionLabel(standing)}</p>
      {standing.met === 0 ? (
        <p>
          Below every listed closing aggregate
          {next ? ` (nearest is ${next.name}, ${next.institution}, ${formatClosingMerit(next.closingMerit)})` : ''}.
        </p>
      ) : (
        <>
          <p>Meets {standing.met} {standing.met === 1 ? 'program' : 'programs'}.</p>
          {best ? <p>Highest match: {best.name} ({best.institution}).</p> : null}
          <p>
            {next
              ? `Next above you: ${next.name} (${next.institution}) ${formatClosingMerit(next.closingMerit)}.`
              : 'At or above the highest closing merit.'}
          </p>
        </>
      )}
      <PotentialPrograms year={year} programs={standing.metPrograms} />
    </div>
  );
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function MeritCalculator() {
  const androidApp = isNativeAndroidRuntime();
  const [mode, setMode] = useState<InputMode>('marks');
  const [androidTrack, setAndroidTrack] = useState<'fsc' | 'alevel'>('fsc');

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

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
        if (import.meta.env.DEV) {
          console.warn('Invalid input range');
        }
        return;
      }
    }

    const aggregate = matricPercent * 0.1 + fscPercent * 0.15 + netPercent * 0.75;
    setFscAggregate(aggregate);
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
        if (import.meta.env.DEV) {
          console.warn('Invalid input range');
        }
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
    setPdfError('');
  };

  const [programMerits, setProgramMerits] = useState<ClosingMeritProgram[]>(() => catalogClosingMerits());
  const [meritYear, setMeritYear] = useState(DEFAULT_CLOSING_MERIT_YEAR);
  const [meritGroup, setMeritGroup] = useState('all');

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ programs?: ClosingMeritProgram[]; year?: number }>('/api/public/closing-merits')
      .then((data) => {
        if (cancelled || !Array.isArray(data?.programs) || !data.programs.length) return;
        setProgramMerits(mergeClosingMeritPrograms(data.programs, catalogClosingMerits()));
        if (Number.isInteger(Number(data.year))) setMeritYear(Number(data.year));
      })
      .catch(() => {
        // Keep the programs-page list until the admin list is available.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const meritGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; programs: ClosingMeritProgram[] }> = [];
    programMerits.forEach((program) => {
      const key = program.categoryKey || program.categoryLabel || 'programs';
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.programs.push(program);
        return;
      }
      groups.push({
        key,
        label: program.categoryLabel || 'Programs',
        programs: [program],
      });
    });
    return groups;
  }, [programMerits]);

  const visibleMeritGroups = meritGroup === 'all'
    ? meritGroups
    : meritGroups.filter((group) => group.key === meritGroup);

  const fscStanding = useMemo(
    () => (fscAggregate == null ? null : standingOnClosingMeritList(fscAggregate, programMerits)),
    [fscAggregate, programMerits],
  );
  const aLevelStanding = useMemo(
    () => (aLevelAggregate == null ? null : standingOnClosingMeritList(aLevelAggregate, programMerits)),
    [aLevelAggregate, programMerits],
  );
  const focusAggregate = androidApp
    ? (androidTrack === 'alevel' ? aLevelAggregate : fscAggregate)
    : (fscAggregate ?? aLevelAggregate);
  const focusStanding = androidApp
    ? (androidTrack === 'alevel' ? aLevelStanding : fscStanding)
    : (fscStanding ?? aLevelStanding);

  const downloadMeritPdf = async () => {
    const tracks = [
      fscAggregate != null && fscStanding ? { label: 'FSc', aggregate: fscAggregate, standing: fscStanding } : null,
      aLevelAggregate != null && aLevelStanding ? { label: 'A-Level', aggregate: aLevelAggregate, standing: aLevelStanding } : null,
    ].filter((track): track is { label: string; aggregate: number; standing: MeritListStanding } => track != null);
    if (!tracks.length || pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      const blob = await buildMeritResultPdf({ year: meritYear, tracks });
      await openOrSaveBlobOnDevice(blob, `NET360-Merit-Result-${meritYear}.pdf`, 'download');
    } catch {
      setPdfError('Could not create the merit result PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const selectClass =
    'flex min-h-11 w-full max-w-full rounded-md border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:max-w-xs md:max-w-sm';

  return (
    <div className={androidApp ? 'net360-merit space-y-5' : 'space-y-5'}>
      <div className="net360-merit-head">
        <h1 className="flex items-center gap-2">
          <Calculator className="w-7 h-7" />
          Merit Calculator
        </h1>
        <p className="text-muted-foreground">Calculate your expected aggregate and merit position</p>
        {androidApp ? (
          <div className="net360-merit-mode" role="group" aria-label="Input mode">
            <button type="button" className={mode === 'marks' ? 'is-on' : ''} onClick={() => setMode('marks')}>Marks</button>
            <button type="button" className={mode === 'percentage' ? 'is-on' : ''} onClick={() => setMode('percentage')}>Percentage</button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <div className="net360-merit-calcs space-y-4 min-w-0" data-track={androidApp ? androidTrack : undefined}>
          {androidApp ? (
            <div className="net360-merit-switch" role="tablist" aria-label="Calculator">
              <button type="button" role="tab" aria-selected={androidTrack === 'fsc'} className={androidTrack === 'fsc' ? 'is-on' : ''} onClick={() => setAndroidTrack('fsc')}>FSc</button>
              <button type="button" role="tab" aria-selected={androidTrack === 'alevel'} className={androidTrack === 'alevel' ? 'is-on' : ''} onClick={() => setAndroidTrack('alevel')}>A-Level</button>
            </div>
          ) : null}
          <Card className="net360-merit-calc is-fsc rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>FSc Merit Calculator</CardTitle>
                  <CardDescription>Matric, FSc &amp; NET (NUST weighting)</CardDescription>
                </div>
                <div className="net360-merit-mode-inline space-y-1.5 shrink-0">
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
                  <MobileFold title="Academic details">
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
                  </MobileFold>
                  <MobileFold title="NET details">
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
                  </MobileFold>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <MobileFold title="Academic details">
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
                  </MobileFold>
                  <MobileFold title="NET details">
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
                  </MobileFold>
                </div>
              )}

              <Button
                type="button"
                onClick={calculateFscAggregate}
                aria-label="Calculate FSc aggregate"
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
              >
                {androidApp ? 'Calculate aggregate' : 'Calculate FSc aggregate'}
              </Button>

              <div className="net360-merit-formula rounded-lg border border-indigo-100 bg-[#f2f5ff] px-3 py-2">
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

          <Card className="net360-merit-calc is-alevel rounded-2xl border-indigo-100 bg-white/92">
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
                aria-label="Calculate A-Level aggregate"
                className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
              >
                {androidApp ? 'Calculate aggregate' : 'Calculate A-Level aggregate'}
              </Button>

              <div className="net360-merit-formula rounded-lg border border-indigo-100 bg-[#f2f5ff] px-3 py-2">
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

          {androidApp ? (
            <div className="net360-merit-formulas">
              <div className="is-fsc">
                <p>FSc formula</p>
                <p>Matric, FSc &amp; NET (NUST weighting)</p>
                <p>Aggregate = (Matric% × 0.10) + (FSc% × 0.15) + (NET% × 0.75)</p>
                <p>Percentages may come from marks (obtained ÷ total × 100) or direct entry.</p>
              </div>
              <div className="is-alevel">
                <p>A-Level formula</p>
                <p>Uses the same input mode as above (marks or percentage)</p>
                <p>Aggregate = (Matric Equivalence% × 0.25) + (NET% × 0.75)</p>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button onClick={reset} variant="outline" className="border-indigo-200 bg-white text-slate-700 sm:col-span-2">
              Reset all
            </Button>
          </div>
        </div>

        <Card className={`net360-merit-result rounded-2xl border-indigo-100 bg-white/92 h-fit`}>
          <CardHeader>
            <CardTitle>Your Result</CardTitle>
            <CardDescription>Your aggregate placed on the closing-merit list</CardDescription>
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
              <p className="text-[15px] text-slate-700">Merit position</p>
              <p className="text-xl font-semibold text-indigo-950 sm:text-2xl">{meritPositionLabel(focusStanding)}</p>
            </div>

            <div className="space-y-3 rounded-xl border border-indigo-100 bg-gradient-to-r from-[#f5f7ff] to-[#edf2ff] p-4 text-sm text-slate-600">
              {fscStanding ? <TrackOutcome label="FSc" year={meritYear} standing={fscStanding} /> : null}
              {aLevelStanding ? (
                <div className={fscStanding ? 'border-t border-indigo-100 pt-3' : ''}>
                  <TrackOutcome label="A-Level" year={meritYear} standing={aLevelStanding} />
                </div>
              ) : null}
              {!fscStanding && !aLevelStanding ? (
                <p>Calculate an aggregate to place it on the closing-merit list. Position 1 means your aggregate is at or above the highest number. You meet a program when your aggregate is at least its closing merit.</p>
              ) : (
                <p className="text-slate-500">Merit position is estimated from the admin closing aggregates and closing merit positions. A program is met when your aggregate is at least its closing aggregate.</p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={(!fscStanding && !aLevelStanding) || pdfBusy}
                onClick={() => void downloadMeritPdf()}
                className="border-indigo-200 bg-white text-indigo-800"
              >
                <Download className="mr-2 h-4 w-4" />
                {pdfBusy ? 'Preparing PDF…' : 'Download merit result'}
              </Button>
              {pdfError ? <p className="text-sm text-rose-700">{pdfError}</p> : null}
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

      <Card className="net360-merit-board rounded-2xl border-indigo-100 bg-white/92">
        <CardHeader>
          <CardTitle>Last Year&apos;s Closing Merits</CardTitle>
          <CardDescription>{meritYear} closing merits. Each row shows the closing aggregate, merit position, and whether it is Real or Estimated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="net360-merit-cats" role="tablist" aria-label="Program category">
            <button type="button" className={meritGroup === 'all' ? 'is-on' : ''} onClick={() => setMeritGroup('all')}>All</button>
            {meritGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={meritGroup === group.key ? 'is-on' : ''}
                onClick={() => setMeritGroup(group.key)}
              >
                {MERIT_GROUP_LABELS[group.key] || group.label}
              </button>
            ))}
          </div>

          {visibleMeritGroups.map((group) => (
            <section key={group.key} className="net360-merit-group">
              <h3>{group.label}</h3>
              <div>
                {group.programs.map((program) => {
                  const merit = Number(program.closingMerit);
                  const meets = focusAggregate != null
                    && program.closingMerit != null
                    && Number.isFinite(merit)
                    && focusAggregate >= merit;
                  return (
                  <div key={program.id} className={meets ? 'is-met bg-emerald-50' : ''}>
                    <div>
                      <p>{program.name}</p>
                      <p>{program.institution}{program.location ? ` · ${program.location}` : ''}{program.meritPosition != null ? ` · Position ${formatMeritPosition(program.meritPosition)}` : ''} · {meritStatusLabel(program.meritStatus)}</p>
                    </div>
                    <div>{formatClosingMerit(program.closingMerit)}</div>
                  </div>
                  );
                })}
              </div>
            </section>
          ))}

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
