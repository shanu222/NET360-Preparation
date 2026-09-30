import { NET360_SOCIAL_LINKS, openSocialLink } from '../../lib/socialLinks';

function SocialIcon({ id }: { id: (typeof NET360_SOCIAL_LINKS)[number]['id'] }) {
  if (id === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (id === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M14.2 20v-6.1h2.05l.31-2.38H14.2V10c0-.69.19-1.16 1.18-1.16h1.26V6.7c-.22-.03-.96-.09-1.83-.09-1.81 0-3.05 1.1-3.05 3.13v1.75H9.5v2.38h2.26V20h2.44Z" />
      </svg>
    );
  }
  if (id === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M23.5 7.2a3 3 0 0 0-2.1-2.1C19.5 4.6 12 4.6 12 4.6s-7.5 0-9.4.5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 0 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-4.8ZM9.8 15.5v-7l6.3 3.5-6.3 3.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 12h16M12 4c2.2 2.3 3.3 5 3.3 8s-1.1 5.7-3.3 8c-2.2-2.3-3.3-5-3.3-8s1.1-5.7 3.3-8Z" />
    </svg>
  );
}

/** Android Home social row: brand icons on outlined tiles, same layout as the reference app. */
export function AndroidSocialLinksCards() {
  return (
    <section className="net360-social" aria-label="NET360 on YouTube, Instagram, Facebook, and the web">
      <p className="net360-social-title">NET360</p>
      <div className="net360-social-row">
        {NET360_SOCIAL_LINKS.map((item) => (
          <a
            key={item.id}
            className={`net360-social-link net360-social-${item.id}`}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              openSocialLink(item.href);
            }}
          >
            <span className="net360-social-icon">
              <SocialIcon id={item.id} />
            </span>
            <span>{item.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
