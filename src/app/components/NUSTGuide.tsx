import { type ComponentType, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiRequest } from '../lib/api';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle,
  CheckCircle2,
  FileCheck,
  Globe,
  GraduationCap,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';

type GuideTab = 'overview' | 'policy' | 'dates' | 'eligibility';

interface NustImportantDateRow {
  key: string;
  title: string;
  registration: string;
  testDate: string;
  status: 'open' | 'closed' | 'upcoming' | 'completed' | 'info';
}

interface NustImportantNoticeRow {
  key: string;
  title: string;
  subtitle: string;
  category: 'notice' | 'result' | 'act_sat' | 'net';
  status: 'open' | 'closed' | 'upcoming' | 'completed' | 'info';
}

const DEFAULT_IMPORTANT_DATES: NustImportantDateRow[] = [
  {
    key: 'series-1',
    title: 'NET Series 1',
    registration: 'Online Registration: 05 Oct - 25 Nov 2025',
    testDate: 'Test Schedule: 22 Nov - 10 Dec 2025',
    status: 'completed',
  },
  {
    key: 'series-2',
    title: 'NET Series 2',
    registration: 'Online Registration: 14 Dec 2025 - 01 Feb 2026',
    testDate: 'Test Schedule: 31 Jan - 15 Feb 2026 (Islamabad); 25 - 26 Mar 2026 (Quetta)',
    status: 'open',
  },
  {
    key: 'series-3',
    title: 'NET Series 3',
    registration: 'Online Registration: 22 Feb - 30 Mar 2026',
    testDate: 'Test Schedule: 04 Apr 2026 onwards',
    status: 'upcoming',
  },
  {
    key: 'series-4',
    title: 'NET Series 4',
    registration: 'Online Registration: Apr - Jun 2026',
    testDate: 'Test Schedule: Jun 2026 (Islamabad); Jul 2026 (Quetta)',
    status: 'upcoming',
  },
];

const DEFAULT_IMPORTANT_NOTICES: NustImportantNoticeRow[] = [
  {
    key: 'notice-default',
    title: 'Important notices update automatically from admissions data.',
    subtitle: 'Latest NET, result, and ACT/SAT updates will appear here.',
    category: 'notice',
    status: 'info',
  },
];

const NOTICE_BLOCKLIST_PATTERNS = [
  /mathematics\s*course/i,
  /pre[\s-]*medical/i,
  /8\s*weeks?\s*(duration\s*)?course/i,
];

function filterBlockedImportantNotices(items: NustImportantNoticeRow[]): NustImportantNoticeRow[] {
  return items.filter((item) => {
    const haystack = `${String(item?.title || '')} ${String(item?.subtitle || '')}`;
    return !NOTICE_BLOCKLIST_PATTERNS.some((pattern) => pattern.test(haystack));
  });
}

function statusToCardTone(status: NustImportantDateRow['status']) {
  switch (status) {
    case 'completed':
      return 'border-blue-500 bg-blue-50';
    case 'open':
      return 'border-green-500 bg-green-50';
    case 'closed':
      return 'border-rose-500 bg-rose-50';
    case 'upcoming':
      return 'border-purple-500 bg-purple-50';
    default:
      return 'border-orange-500 bg-orange-50';
  }
}

function statusToBadge(status: NustImportantDateRow['status']) {
  switch (status) {
    case 'completed':
      return { label: 'Completed', className: '', variant: 'secondary' as const };
    case 'open':
      return { label: 'Open', className: 'bg-green-500', variant: 'default' as const };
    case 'closed':
      return { label: 'Closed', className: 'bg-rose-500', variant: 'default' as const };
    case 'upcoming':
      return { label: 'Upcoming', className: '', variant: 'outline' as const };
    default:
      return { label: 'Info', className: '', variant: 'outline' as const };
  }
}

export function NUSTGuide() {
  const [activeTab, setActiveTab] = useState<GuideTab>('overview');
  const [sscMarks, setSscMarks] = useState('');
  const [hsscMarks, setHsscMarks] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<string[]>([]);
  const [importantDates, setImportantDates] = useState<NustImportantDateRow[]>(DEFAULT_IMPORTANT_DATES);
  const [importantNotices, setImportantNotices] = useState<NustImportantNoticeRow[]>(DEFAULT_IMPORTANT_NOTICES);

  useEffect(() => {
    let cancelled = false;

    const loadFeed = async () => {
      try {
        const payload = await apiRequest<{
          dates?: NustImportantDateRow[];
          notices?: NustImportantNoticeRow[];
        }>('/api/public/nust-admissions-feed');

        if (cancelled) return;
        if (Array.isArray(payload.dates) && payload.dates.length) {
          setImportantDates(payload.dates);
        }
        if (Array.isArray(payload.notices) && payload.notices.length) {
          const safeNotices = filterBlockedImportantNotices(payload.notices);
          setImportantNotices(safeNotices.length ? safeNotices : DEFAULT_IMPORTANT_NOTICES);
        }
      } catch {
        // Keep fallback data when live updates are unavailable.
      }
    };

    void loadFeed();
    const timer = window.setInterval(() => {
      void loadFeed();
    }, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const navigateTo = (tab: GuideTab, sectionId?: string) => {
    setActiveTab(tab);

    if (sectionId) {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  };

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

  const routeCards = [
    {
      title: 'NET (NUST Entry Test)',
      subtitle: 'Most Popular',
      points: ['Computer-based test', 'Multiple attempts allowed', '4 series every year'],
      action: 'View NET Details',
      actionTab: 'policy' as GuideTab,
      actionTargetId: 'net-policy-card',
      tone: 'from-violet-500 via-indigo-500 to-blue-500',
      buttonTone: 'from-violet-500 to-indigo-500',
      icon: GraduationCap,
    },
    {
      title: 'SAT (International Students)',
      subtitle: 'Alternative Route',
      points: ['Accepted for overseas applicants', 'Minimum score requirement', 'Direct merit consideration'],
      action: 'View SAT Requirements',
      actionTab: 'policy' as GuideTab,
      actionTargetId: 'sat-policy-card',
      tone: 'from-cyan-400 via-sky-400 to-indigo-500',
      buttonTone: 'from-blue-500 to-cyan-500',
      icon: Globe,
    },
    {
      title: 'ACT (Alternative Route)',
      subtitle: 'Alternative Route',
      points: ['International admission route', 'Minimum ACT score required', 'Accepted by NUST for certain programs'],
      action: 'View ACT Requirements',
      actionTab: 'policy' as GuideTab,
      actionTargetId: 'act-policy-card',
      tone: 'from-orange-400 via-amber-400 to-rose-400',
      buttonTone: 'from-amber-500 to-orange-500',
      icon: Sparkles,
    },
  ];

  const timeline = [
    { label: 'NET Series 1', month: 'December' },
    { label: 'NET Series 2', month: 'February' },
    { label: 'NET Series 3', month: 'April' },
    { label: 'NET Series 4', month: 'June / July' },
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#edf2ff] via-[#e8e5ff] to-[#f8dff0] p-5 sm:p-6 dark:border-indigo-900/60 dark:bg-gradient-to-r dark:from-slate-900 dark:via-indigo-950/90 dark:to-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(88,108,242,0.18),transparent_35%),radial-gradient(circle_at_84%_22%,rgba(247,180,214,0.28),transparent_32%)] dark:bg-[radial-gradient(circle_at_18%_24%,rgba(96,165,250,0.2),transparent_38%),radial-gradient(circle_at_84%_22%,rgba(129,140,248,0.16),transparent_34%)]" />
        <div className="relative space-y-4">
          <div>
            <h1 className="text-3xl text-indigo-950 dark:text-indigo-100">Complete NUST Admission Guide</h1>
            <p className="text-base text-slate-600 dark:text-indigo-200/90">Everything you need to know about NUST admissions</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <GuidePill icon={GraduationCap} label="4 Admission Routes" />
            <GuidePill icon={CalendarDays} label="NET Conducted 4 Times / Year" />
            <GuidePill icon={Target} label="Merit Based Selection" />
          </div>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as GuideTab)} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-[#eef2ff] via-[#f1ecff] to-[#f5f8ff] p-1.5 shadow-[0_8px_18px_rgba(79,70,229,0.14)] sm:grid-cols-4">
          <TabsTrigger
            value="overview"
            className="rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!to-violet-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="policy"
            className="rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!to-violet-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]"
          >
            Admission Policy
          </TabsTrigger>
          <TabsTrigger
            value="dates"
            className="rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!to-violet-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]"
          >
            Important Dates
          </TabsTrigger>
          <TabsTrigger
            value="eligibility"
            className="rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!to-violet-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]"
          >
            Eligibility
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div>
            <h2 className="text-3xl text-indigo-950">Entry Routes to NUST</h2>
            <p className="text-slate-600">Multiple pathways to join NUST</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {routeCards.map((route) => {
              const Icon = route.icon;

              return (
                <article
                  key={route.title}
                  className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_14px_30px_rgba(98,113,202,0.12)]"
                >
                  <div className={`flex items-center justify-between bg-gradient-to-r px-4 py-3 text-white ${route.tone}`}>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    {route.subtitle === 'Most Popular' ? <Badge className="bg-indigo-700/80">Most Popular</Badge> : null}
                  </div>
                  <div className="space-y-3 p-4">
                    <h3 className="text-xl leading-tight text-indigo-950 sm:text-2xl">{route.title}</h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {route.points.map((item) => (
                        <li key={item} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      onClick={() => navigateTo(route.actionTab, route.actionTargetId)}
                      className={`h-10 w-full bg-gradient-to-r ${route.buttonTone} text-white sm:w-auto`}
                    >
                      {route.action}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[2fr_1.3fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Admission Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative mb-5 mt-2 h-2 rounded-full bg-indigo-100">
                  <div className="absolute left-0 top-0 h-2 w-full rounded-full bg-gradient-to-r from-violet-400 via-blue-400 to-orange-400" />
                  <div className="absolute inset-0 grid grid-cols-4">
                    {timeline.map((item, index) => (
                      <div key={item.label} className="relative">
                        <div
                          className={`absolute -top-1.5 h-5 w-5 rounded-full border-4 border-white ${
                            index === 3 ? 'bg-orange-400' : 'bg-violet-400'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-3 text-sm text-slate-700 sm:grid-cols-4">
                  {timeline.map((item) => (
                    <div key={item.label}>
                      <p className="font-semibold text-indigo-950">{item.label}</p>
                      <p className="text-slate-500">{item.month}</p>
                    </div>
                  ))}
                </div>
            </CardContent>
          </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="inline-flex items-center gap-2 text-xl">
                    <ShieldCheck className="h-5 w-5 text-blue-500" /> Eligibility Requirements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="mb-4 space-y-2 text-sm text-slate-700">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> Minimum FSC / A-Level marks</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> NET score requirements</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-500" /> Subject combination criteria</li>
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigateTo('eligibility')}
                  >
                    See Criteria
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="inline-flex items-center gap-2 text-xl">
                    <Scale className="h-5 w-5 text-indigo-500" /> Admission Policy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="mb-4 space-y-2 text-sm text-slate-700">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-indigo-500" /> Merit calculation policy</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-indigo-500" /> Weightage formula</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-indigo-500" /> Program specific quotas</li>
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigateTo('policy', 'net-policy-card')}
                  >
                    Learn More
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="policy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Admission Policy and Merit Rules</CardTitle>
              <CardDescription>Understanding NUST admission criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div id="net-policy-card" className="flex scroll-mt-24 items-start gap-3">
                  <Target className="w-5 h-5 text-blue-500 mt-1" />
                  <div>
                    <h4>Merit-Based Admission</h4>
                    <p className="text-sm text-muted-foreground">
                      Admission is strictly merit-based. Your aggregate is calculated from SSC (10%), HSSC (15%),
                      and NET/SAT score (75%).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <CalendarDays className="w-5 h-5 text-green-500 mt-1" />
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
                  <FileCheck className="w-5 h-5 text-orange-500 mt-1" />
                  <div>
                    <h4>Computer-Based Test</h4>
                    <p className="text-sm text-muted-foreground">
                      NET tests at NUST Islamabad Main Campus are computer-based, while
                      NET tests conducted in Karachi are paper-based. The test format
                      depends on your selected test location.
                    </p>
                  </div>
                </div>

                <div id="sat-policy-card" className="flex scroll-mt-24 items-start gap-3">
                  <Globe className="w-5 h-5 text-sky-500 mt-1" />
                  <div>
                    <h4>SAT Route Guidance</h4>
                    <p className="text-sm text-muted-foreground">
                      SAT-based applications are considered for eligible categories. Always verify the latest minimum score
                      and submission timeline from NUST undergraduate admissions before applying.
                    </p>
                  </div>
                </div>

                <div id="act-policy-card" className="flex scroll-mt-24 items-start gap-3">
                  <Sparkles className="w-5 h-5 text-amber-500 mt-1" />
                  <div>
                    <h4>ACT Route Guidance</h4>
                    <p className="text-sm text-muted-foreground">
                      ACT can be used as an alternate admission route for specific applicants. Confirm latest required composite
                      score and accepted categories from the official NUST policy notice.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
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
                {importantDates.map((item) => {
                  const badge = statusToBadge(item.status);
                  return (
                    <div key={item.key} className={`p-4 border-l-4 rounded-r-lg ${statusToCardTone(item.status)}`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4>{item.title}</h4>
                        <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                      </div>
                      <p className="text-sm">{item.registration}</p>
                      <p className="text-sm text-muted-foreground">{item.testDate}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Important Notices</CardTitle>
              <CardDescription>Live admission announcements, result alerts, and ACT/SAT updates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {filterBlockedImportantNotices(importantNotices).map((item) => {
                  const badge = statusToBadge(item.status);
                  return (
                    <div key={item.key} className={`p-4 border-l-4 rounded-r-lg ${statusToCardTone(item.status)}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h4 className="leading-tight">{item.title}</h4>
                        <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    </div>
                  );
                })}
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
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
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
                  <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
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

function GuidePill({
  icon: Icon,
  label,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/75 px-3 py-2 text-sm text-indigo-900 shadow-sm dark:border-indigo-400/25 dark:bg-indigo-950/55 dark:text-indigo-100">
      <span className="net360-icon-circle inline-flex h-7 w-7 items-center justify-center rounded-full">
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}
