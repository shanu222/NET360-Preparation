import { useMemo } from 'react';
import { formatCountdown, useSubscription } from '../../context/SubscriptionContext';
import { cn } from '../ui/utils';

export function PremiumCountdownBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { surface, badge, loading } = useSubscription();

  const text = useMemo(() => {
    if (loading && !surface?.allowed) return '…';
    if (surface?.allowed && surface?.source === 'bypass') {
      return compact ? 'Open' : badge?.label || 'Full access';
    }
    if (loading && !surface?.endsAt) return '…';
    if (!surface?.allowed) {
      return badge?.label || 'Free';
    }
    const { days, hours, minutes } = formatCountdown(surface.msRemaining);
    if (compact) {
      if (days > 0) return `${days}d`;
      if (hours > 0) return `${hours}h`;
      return `${minutes}m`;
    }
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    const { seconds } = formatCountdown(surface.msRemaining);
    return `${minutes}m ${seconds}s`;
  }, [surface, surface?.source, surface?.endsAt, surface?.allowed, badge, loading, compact]);

  const variant = badge?.variant || 'neutral';

  return (
    <span
      className={cn(
        'inline-flex max-w-[200px] items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold leading-tight sm:text-xs',
        variant === 'green' && 'border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-100',
        variant === 'orange' && 'border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-400/45 dark:bg-amber-950/55 dark:text-amber-100',
        variant === 'red' && 'border-rose-300/90 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100',
        variant === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200',
        className,
      )}
      title={badge?.label || 'Subscription status'}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}
