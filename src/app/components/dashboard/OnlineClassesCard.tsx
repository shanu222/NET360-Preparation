import { GraduationCap } from 'lucide-react';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { openOnlineClassesWhatsApp, useOnlineClassesContent } from '../../lib/onlineClasses';
import { Button } from '../ui/button';

export function OnlineClassesCard() {
  const content = useOnlineClassesContent();
  const nativeApp = isNativeRuntime();

  const register = () => openOnlineClassesWhatsApp();

  if (nativeApp) {
    return (
      <article className="net360-android-outline-card rounded-3xl p-4">
        <div className="flex items-start gap-3">
          <span className="net360-android-classes-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <GraduationCap className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{content.title}</h2>
            {content.description ? (
              <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{content.description}</p>
            ) : null}
            {content.registrationMessage ? (
              <p className="mt-2 text-[13px] text-slate-600 dark:text-slate-300">{content.registrationMessage}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11 w-full rounded-xl"
          onClick={register}
        >
          Register for Online Classes
        </Button>
      </article>
    );
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-indigo-50 p-5 shadow-[0_14px_32px_rgba(217,119,6,0.12)] dark:border-amber-500/30 dark:from-amber-950/40 dark:via-slate-900 dark:to-indigo-950/40">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
          <GraduationCap className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-indigo-950 dark:text-slate-50">{content.title}</h2>
          {content.description ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{content.description}</p>
          ) : null}
          {content.registrationMessage ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{content.registrationMessage}</p>
          ) : null}
          <Button type="button" className="mt-4 min-h-11 rounded-xl" onClick={register}>
            Register for Online Classes
          </Button>
        </div>
      </div>
    </article>
  );
}
