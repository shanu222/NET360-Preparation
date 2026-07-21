import { useEffect, useId, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { cn } from './ui/utils';

export function TabSwitchWarningDialog({
  open,
  level,
  onAcknowledge,
}: {
  open: boolean;
  level: 1 | 2;
  onAcknowledge: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const acknowledgeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => acknowledgeRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, level]);

  const isFirst = level === 1;
  const title = isFirst ? 'Warning 1/2' : 'Warning 2/2';
  const description = isFirst
    ? 'You have left the exam window. Repeated violations will automatically submit your test.'
    : 'One more violation will automatically end your exam.';

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onAcknowledge(); }}>
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[80] bg-slate-950/55" />
        <AlertDialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            'fixed top-[50%] left-[50%] z-[81] grid w-[min(calc(100%-1.5rem),26rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border-2 bg-white p-4 shadow-2xl outline-none sm:p-5',
            isFirst ? 'border-amber-500' : 'border-rose-600',
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            acknowledgeRef.current?.focus();
          }}
        >
          <AlertDialogHeader className="space-y-2 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2b5f9f]">NET360 Exam Monitor</p>
            <AlertDialogTitle id={titleId} className={cn('text-lg font-semibold', isFirst ? 'text-amber-800' : 'text-rose-800')}>
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription id={descriptionId} className="text-sm leading-relaxed text-slate-700">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              ref={acknowledgeRef}
              type="button"
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[#2b5f9f] bg-[#d7e8ff] px-4 text-sm font-medium text-[#0d2c5a] hover:bg-[#c9deff] sm:w-auto"
              onClick={onAcknowledge}
            >
              Return to Exam
            </button>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}

export function CancelExamDialog({
  open,
  onContinue,
  onCancelAndSubmit,
  submitting = false,
}: {
  open: boolean;
  onContinue: () => void;
  onCancelAndSubmit: () => void;
  submitting?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => continueRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onContinue();
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay className="z-[80] bg-slate-950/55" />
        <AlertDialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className="fixed top-[50%] left-[50%] z-[81] grid w-[min(calc(100%-1.5rem),26rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border-2 border-[#2b5f9f] bg-white p-4 shadow-2xl outline-none sm:p-5"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            continueRef.current?.focus();
          }}
        >
          <AlertDialogHeader className="space-y-2 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2b5f9f]">NET360 Exam</p>
            <AlertDialogTitle id={titleId} className="text-lg font-semibold text-[#0d2c5a]">
              Cancel this exam?
            </AlertDialogTitle>
            <AlertDialogDescription id={descriptionId} className="text-sm leading-relaxed text-slate-700">
              Are you sure you want to cancel this exam? Your current progress will be submitted and the exam cannot be resumed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={continueRef}
              type="button"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[#2b5f9f] bg-[#d7e8ff] px-4 text-sm font-medium text-[#0d2c5a] hover:bg-[#c9deff] disabled:opacity-60 sm:w-auto"
              onClick={onContinue}
            >
              Continue Exam
            </button>
            <button
              type="button"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-rose-700 bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 sm:w-auto"
              onClick={onCancelAndSubmit}
            >
              {submitting ? 'Submitting…' : 'Cancel & Submit'}
            </button>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
