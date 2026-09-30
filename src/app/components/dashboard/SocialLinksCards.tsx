import { Facebook, Globe, Instagram, Youtube } from 'lucide-react';
import { NET360_SOCIAL_LINKS, openSocialLink } from '../../lib/socialLinks';

const ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  website: Globe,
} as const;

const TONE: Record<(typeof NET360_SOCIAL_LINKS)[number]['id'], string> = {
  youtube: 'from-rose-100 to-white',
  instagram: 'from-fuchsia-100 to-white',
  facebook: 'from-sky-100 to-white',
  website: 'from-indigo-100 to-white',
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
            className={`group rounded-2xl border border-indigo-100 bg-gradient-to-br ${TONE[item.id]} p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(88,103,195,0.18)]`}
          >
            <div className="net360-icon-surface mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-indigo-950">{item.label}</p>
          </button>
        );
      })}
    </div>
  );
}
