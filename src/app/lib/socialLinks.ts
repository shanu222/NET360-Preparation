export const NET360_SOCIAL_LINKS = [
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/@nustnetpreparation?si=Y2yBmyeZVIfrpYOB',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/net360prep?stkn=MTdyNGdsOXltYXBlZQ%3D%3D&utm_source=qr',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: 'https://www.facebook.com/share/1YbpZZHbTg/?mibextid=wwXIfr',
  },
  {
    id: 'website',
    label: 'Website',
    href: 'https://www.net360preparation.com/',
  },
] as const;

export function openSocialLink(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}
