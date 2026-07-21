import { useEffect, useId, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { Lock, Monitor, Smartphone, TabletSmartphone } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { cn } from './ui/utils';

export type SessionConflictPlatform = string | null | undefined;

function normalizePlatformLabel(value: SessionConflictPlatform) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { label: 'Another device', kind: 'unknown' as const };
  if (raw.includes('android')) return { label: 'Android', kind: 'android' as const };
  if (raw.includes('iphone') || raw.includes('ios') || raw === 'apple') {
    return { label: 'iPhone', kind: 'ios' as const };
  }
  if (raw.includes('ipad') || raw.includes('tablet')) {
    return { label: 'Tablet', kind: 'tablet' as const };
  }
  if (
    raw.includes('web')
    || raw.includes('desktop')
    || raw.includes('browser')
    || raw.includes('chrome')
    || raw.includes('safari')
  ) {
    return { label: 'Web', kind: 'web' as const };
  }
  return { label: String(value).trim(), kind: 'unknown' as const };
}

function PlatformIcon({ kind }: { kind: 'android' | 'ios' | 'tablet' | 'web' | 'unknown' }) {
  const className = 'h-4 w-4 shrink-0';
  if (kind === 'web') return <Monitor className={className} aria-hidden />;
  if (kind === 'tablet') return <TabletSmartphone className={className} aria-hidden />;
  return <Smartphone className={className} aria-hidden />;
}

interface SessionConflictModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPlatform?: SessionConflictPlatform;
  onContinue: () => void;
  onCancel: () => void;
  continuing?: boolean;
}

/**
 * Production SaaS session-takeover dialog.
 * Opaque surfaces only — avoids theme-variable transparency that made prior copy unreadable.
 */
export function SessionConflictModal({
  open,
  onOpenChange,
  existingPlatform,
  onContinue,
  onCancel,
  continuing = false,
}: SessionConflictModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const platform = normalizePlatformLabel(existingPlatform);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      continueRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (continuing && !next) return;
        if (!next) onCancel();
        else onOpenChange(next);
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay
          className={cn(
            'fixed inset-0 z-[80] !bg-slate-950/80 backdrop-blur-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <AlertDialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onEscapeKeyDown={(event) => {
            if (continuing) {
              event.preventDefault();
              return;
            }
            onCancel();
          }}
          className={cn(
            'fixed top-[50%] left-[50%] z-[81] w-[min(100%-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-indigo-100 !bg-white p-0 !text-slate-900',
            'shadow-[0_28px_64px_rgba(15,23,42,0.35)] outline-none focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'duration-200',
          )}
        >
          <div className="relative overflow-hidden rounded-2xl bg-white">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 opacity-[0.12]"
              aria-hidden
            />
            <div className="relative space-y-4 p-5 sm:p-6">
              <AlertDialogHeader className="space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.35)]"
                    aria-hidden
                  >
                    <Lock className="h-5 w-5" strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <AlertDialogTitle
                      id={titleId}
                      className="text-lg font-semibold tracking-tight !text-slate-900 sm:text-xl"
                    >
                      Account Already Active
                    </AlertDialogTitle>
                    <AlertDialogDescription
                      id={descriptionId}
                      className="text-sm leading-relaxed !text-slate-600"
                    >
                      Your account is currently signed in on another device. For security, NET360
                      allows only one active session at a time.
                    </AlertDialogDescription>
                  </div>
                </div>
              </AlertDialogHeader>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Previous session
                </p>
                <div className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-indigo-100 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                    <PlatformIcon kind={platform.kind} />
                  </span>
                  <span className="truncate">{platform.label}</span>
                </div>
              </div>

              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 sm:text-sm">
                Continuing will securely sign you out from your previous device.
              </p>

              <AlertDialogFooter className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={continuing}
                  className="h-11 w-full rounded-xl border-slate-300 !bg-white !text-slate-800 hover:!bg-slate-50 sm:w-auto sm:min-w-[7.5rem]"
                  onClick={() => {
                    if (continuing) return;
                    onCancel();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  ref={continueRef}
                  type="button"
                  disabled={continuing}
                  className="h-11 w-full rounded-xl !bg-indigo-600 !text-white shadow-[0_12px_28px_rgba(79,70,229,0.35)] hover:!bg-indigo-500 sm:w-auto sm:min-w-[9.5rem]"
                  onClick={() => {
                    if (continuing) return;
                    onContinue();
                  }}
                >
                  {continuing ? 'Switching…' : 'Continue Here'}
                </Button>
              </AlertDialogFooter>
            </div>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
