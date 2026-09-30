import { Facebook, Globe, Instagram, Youtube } from 'lucide-react';
import { NET360_SOCIAL_LINKS, openSocialLink } from '../../lib/socialLinks';

const ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  website: Globe,
} as const;

const TONE: Record<(typeof NET360_SOCIAL_LINKS)[number]['id'], string> = {
  youtube: 'border-rose-300 from-rose-50 to-white text-rose-950 dark:border-rose-400 dark:from-rose-950/70 dark:to-slate-900 dark:text-rose-50',
  instagram: 'border-pink-300 from-pink-50 to-white text-pink-950 dark:border-pink-400 dark:from-pink-950/70 dark:to-slate-900 dark:text-pink-50',
  facebook: 'border-sky-300 from-sky-50 to-white text-sky-950 dark:border-sky-400 dark:from-sky-950/70 dark:to-slate-900 dark:text-sky-50',
  website: 'border-indigo-300 from-indigo-50 to-white text-indigo-950 dark:border-indigo-400 dark:from-indigo-950/70 dark:to-slate-900 dark:text-indigo-50',
};

/** Web Home cards: same outlined Quick Action language already used on the dashboard. */
export function WebSocialLinksCards() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {NET360_SOCIAL_LINKS.map((item) => {
        const Icon = ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => openSocialLink(item.href)}
            aria-label={`Open NET360 ${item.label}`}
            className={`group min-w-0 rounded-2xl border bg-gradient-to-br ${TONE[item.id]} p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(88,103,195,0.18)]`}
          >
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-current/15 bg-white/80 dark:bg-slate-950/40">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold">{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
