import { Facebook, Globe, Instagram, Youtube } from 'lucide-react';
import { NET360_SOCIAL_LINKS, openSocialLink } from '../../lib/socialLinks';

const ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  website: Globe,
} as const;

/** Android Home cards: same hub outline, icon well, and 2-column spacing as the rest of the Android shell. */
export function AndroidSocialLinksCards() {
  return (
    <div className="net360-hub-grid">
      {NET360_SOCIAL_LINKS.map((item) => {
        const Icon = ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            className="net360-hub-card flex items-center gap-3"
            onClick={() => openSocialLink(item.href)}
            aria-label={`Open NET360 ${item.label}`}
          >
            <span className="net360-android-plan-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
