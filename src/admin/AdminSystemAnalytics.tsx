import { useEffect, useState } from 'react';
import { Activity, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { apiRequest } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Badge } from '../app/components/ui/badge';

type RangeStats = {
  activeUsers?: number;
  newUsers?: number;
  returningUsers?: number;
  sessions?: number;
  platforms?: { web?: number; android?: number; ios?: number };
  features?: Record<string, number>;
  errors?: Record<string, number>;
};

type Overview = {
  generatedAt?: string;
  activeNow?: number;
  today?: RangeStats;
  yesterday?: RangeStats;
  month?: RangeStats;
  recentErrors?: Array<{
    eventType?: string;
    category?: string;
    platform?: string;
    screen?: string;
    errorCode?: string;
    message?: string;
    timestamp?: string;
  }>;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 dark:border-white/15 dark:bg-white/5">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

export function AdminSystemAnalytics({ authToken }: { authToken?: string | null }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiRequest<Overview>('/api/admin/analytics/overview', {}, authToken);
      setOverview(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load system analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [authToken]);

  const today = overview?.today || {};
  const yesterday = overview?.yesterday || {};
  const month = overview?.month || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              System Analytics
            </CardTitle>
            <CardDescription>Usage and technical health for authorized administrators only.</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Active Now" value={overview?.activeNow || 0} />
            <Stat label="Today" value={today.activeUsers || 0} />
            <Stat label="Yesterday" value={yesterday.activeUsers || 0} />
            <Stat label="This Month" value={month.activeUsers || 0} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label="Web" value={today.platforms?.web || 0} />
          <Stat label="Android" value={today.platforms?.android || 0} />
          <Stat label="iOS" value={today.platforms?.ios || 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Errors</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Login" value={today.errors?.login || 0} />
          <Stat label="API" value={today.errors?.api || 0} />
          <Stat label="Tests" value={today.errors?.tests || 0} />
          <Stat label="PDF" value={today.errors?.pdf || 0} />
          <Stat label="Community" value={today.errors?.community || 0} />
          <Stat label="NUST" value={today.errors?.nust || 0} />
          <Stat label="Other" value={today.errors?.other || 0} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature usage today</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            ['Tests', today.features?.TESTS],
            ['Practice Board', today.features?.PRACTICE_BOARD],
            ['Community', today.features?.COMMUNITY],
            ['Programs', today.features?.PROGRAMS],
            ['Preparation Materials', today.features?.PREPARATION_MATERIALS],
            ['Quiz Battles', today.features?.QUIZ_BATTLE],
            ['Analytics', today.features?.PERFORMANCE_ANALYTICS],
            ['NUST Admission Guide', today.features?.NUST_ADMISSION_GUIDE],
          ].map(([label, value]) => (
            <Badge key={String(label)} variant="outline" className="border-slate-300 bg-white text-slate-800 dark:border-white/20 dark:bg-slate-900 dark:text-slate-100">
              {label}: {Number(value || 0)}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent technical events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(overview?.recentErrors || []).length ? overview?.recentErrors?.map((item, index) => (
            <div key={`${item.timestamp || index}-${item.eventType}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-white/15">
              <p className="font-medium text-slate-900 dark:text-slate-100">{item.eventType} · {item.platform}</p>
              <p className="text-slate-600 dark:text-slate-300">{item.errorCode || item.message || item.category}</p>
            </div>
          )) : (
            <p className="text-sm text-slate-500">No technical errors recorded today.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
