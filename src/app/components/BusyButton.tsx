import type { ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from './ui/utils';

type BusyButtonProps = ComponentProps<typeof Button> & {
  busy?: boolean;
  busyLabel?: string;
};

/**
 * Production CTA with immediate pressed/busy feedback to avoid “frozen button” multi-taps.
 */
export function BusyButton({
  busy = false,
  busyLabel,
  children,
  className,
  disabled,
  onClick,
  ...props
}: BusyButtonProps) {
  return (
    <Button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'touch-manipulation transition-transform active:scale-[0.98] disabled:active:scale-100',
        className,
      )}
      onClick={(event) => {
        if (busy || disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
      {busy && busyLabel ? busyLabel : children}
    </Button>
  );
}
