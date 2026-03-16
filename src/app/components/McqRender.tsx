import { useEffect, useMemo, useRef } from 'react';

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

function looksLikeMath(value: string) {
  return /\\[a-zA-Z]+|[_^{}]|[∫∑√π≤≥≈≠±∞α-ωΑ-Ω₀-₉⁰-⁹]/.test(String(value || ''));
}

function hasMathDelimiters(value: string) {
  return /\\\(|\\\[|\$\$?|\\begin\{/.test(String(value || ''));
}

const INLINE_IMAGE_TOKEN_REGEX = /\[\[img:(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\]\]/gi;
const INLINE_BOLD_TAG_REGEX = /<(?:strong|b)>([\s\S]*?)<\/\s*(?:strong|b)\s*>/gi;

function normalizeMathSegment(value: string) {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  if (hasMathDelimiters(raw)) return raw;
  if (looksLikeMath(raw)) return `\\(${raw}\\)`;
  return raw;
}

export function normalizeMcqImageSrc(src: string | null | undefined) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (/^(data:|blob:|https?:\/\/)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return `/${value.replace(/^\.\//, '')}`;
}

export function McqMathText({
  value,
  className,
  asBlock = false,
}: {
  value: string;
  className?: string;
  asBlock?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement | null>(null);

  const segments = useMemo(() => {
    const raw = String(value || '');
    if (!raw.trim()) return [] as Array<{ kind: 'text' | 'image' | 'bold'; value: string }>;

    const parts: Array<{ kind: 'text' | 'image' | 'bold'; value: string }> = [];
    const pushRichTextParts = (input: string) => {
      const plain = String(input || '');
      if (!plain) return;

      let boldLastIndex = 0;
      let boldMatch: RegExpExecArray | null;
      const boldRegex = new RegExp(INLINE_BOLD_TAG_REGEX.source, 'gi');

      while ((boldMatch = boldRegex.exec(plain))) {
        const boldStart = boldMatch.index;
        if (boldStart > boldLastIndex) {
          parts.push({ kind: 'text', value: normalizeMathSegment(plain.slice(boldLastIndex, boldStart)) });
        }

        const boldValue = normalizeMathSegment(String(boldMatch[1] || ''));
        if (boldValue) {
          parts.push({ kind: 'bold', value: boldValue });
        }
        boldLastIndex = boldRegex.lastIndex;
      }

      if (boldLastIndex < plain.length) {
        parts.push({ kind: 'text', value: normalizeMathSegment(plain.slice(boldLastIndex)) });
      }
    };
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(INLINE_IMAGE_TOKEN_REGEX.source, 'gi');

    while ((match = regex.exec(raw))) {
      const tokenStart = match.index;
      if (tokenStart > lastIndex) {
        pushRichTextParts(raw.slice(lastIndex, tokenStart));
      }

      const imageSrc = normalizeMcqImageSrc(match[1]);
      if (imageSrc) {
        parts.push({ kind: 'image', value: imageSrc });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      pushRichTextParts(raw.slice(lastIndex));
    }

    if (!parts.length) {
      return [{ kind: 'text', value: normalizeMathSegment(raw) }];
    }

    return parts;
  }, [value]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;

    void mathJax.typesetPromise([node]).catch(() => {
      // Keep UI responsive even if MathJax fails on malformed expressions.
    });
  }, [segments]);

  if (!segments.length) return null;

  return (
    <span
      ref={hostRef}
      className={`math-content ${asBlock ? 'block' : ''} ${className || ''}`.trim()}
      style={{ whiteSpace: 'pre-wrap' }}
    >
      {segments.map((segment, index) => {
        if (segment.kind === 'image') {
          return (
            <img
              key={`math-image-${index}`}
              src={segment.value}
              alt={`Embedded MCQ visual ${index + 1}`}
              className="mcq-inline-image"
            />
          );
        }

        if (!segment.value) return null;

        if (segment.kind === 'bold') {
          return <strong key={`math-bold-${index}`}>{segment.value}</strong>;
        }

        return <span key={`math-text-${index}`}>{segment.value}</span>;
      })}
    </span>
  );
}
