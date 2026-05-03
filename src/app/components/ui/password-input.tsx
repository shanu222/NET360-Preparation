import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from './input';
import { cn } from './utils';

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className={cn(
          'touch-manipulation absolute right-1 top-1/2 flex size-11 min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md',
          'text-muted-foreground outline-none transition-colors hover:text-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4 shrink-0" aria-hidden /> : <Eye className="h-4 w-4 shrink-0" aria-hidden />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
