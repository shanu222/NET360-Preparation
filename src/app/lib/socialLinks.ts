export const NET360_SOCIAL_LINKS = [
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/@netprepare',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/netprepare/',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: 'https://www.facebook.com/netprepare',
  },
  {
    id: 'website',
    label: 'Website',
    href: 'https://www.net360preparation.com',
  },
] as const;

export function openSocialLink(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}
