import { Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { useNavigate } from 'react-router-dom';

export function PremiumLockScreen({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const navigate = useNavigate();

  return (
    <div
      className="relative min-h-[280px] overflow-hidden rounded-3xl border border-[#e6eaf2] bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-[#1a2238]"
      data-premium-lock-screen
    >
      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-100">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        <Button
          type="button"
          className="min-h-11 rounded-xl"
          onClick={() => navigate('/subscription')}
        >
          View plans &amp; pay
        </Button>
      </div>
    </div>
  );
}
