import { Facebook, Instagram, Youtube } from 'lucide-react';
import { NET360_SOCIAL_LINKS, openSocialLink } from '../../lib/socialLinks';

const ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
} as const;

const CARDS = NET360_SOCIAL_LINKS.filter((item) => item.id !== 'website');

const TONE = {
  youtube: {
    card: 'border-rose-300 from-rose-50 to-white text-rose-950 shadow-[0_10px_24px_rgba(225,29,72,0.12)] dark:border-rose-400 dark:from-rose-950/80 dark:to-slate-900 dark:text-rose-50',
    icon: 'bg-[#ff0000] text-white',
  },
  instagram: {
    card: 'border-pink-300 from-pink-50 to-white text-pink-950 shadow-[0_10px_24px_rgba(225,48,108,0.12)] dark:border-pink-400 dark:from-pink-950/80 dark:to-slate-900 dark:text-pink-50',
    icon: 'bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white',
  },
  facebook: {
    card: 'border-sky-300 from-sky-50 to-white text-sky-950 shadow-[0_10px_24px_rgba(24,119,242,0.12)] dark:border-sky-400 dark:from-sky-950/80 dark:to-slate-900 dark:text-sky-50',
    icon: 'bg-[#1877f2] text-white',
  },
} as const;

/** Web Home cards for YouTube, Instagram, and Facebook. */
export function WebSocialLinksCards() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {CARDS.map((item) => {
        const Icon = ICONS[item.id];
        const tone = TONE[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => openSocialLink(item.href)}
            aria-label={`Open NET360 ${item.label}`}
            className={`group min-w-0 rounded-2xl border-2 bg-gradient-to-br p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(88,103,195,0.16)] sm:p-4 ${tone.card}`}
          >
            <div className={`mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm sm:mb-3 sm:h-12 sm:w-12 ${tone.icon}`}>
              <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold leading-tight sm:text-base">{item.label}</p>
            <p className="mt-0.5 text-[11px] font-medium opacity-80 sm:text-xs">NET360</p>
          </button>
        );
      })}
    </div>
  );
}
