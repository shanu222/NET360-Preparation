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
    if (!raw.trim()) return [] as Array<{ kind: 'text' | 'image'; value: string }>;

    const parts: Array<{ kind: 'text' | 'image'; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(INLINE_IMAGE_TOKEN_REGEX.source, 'gi');

    while ((match = regex.exec(raw))) {
      const tokenStart = match.index;
      if (tokenStart > lastIndex) {
        parts.push({ kind: 'text', value: normalizeMathSegment(raw.slice(lastIndex, tokenStart)) });
      }

      const imageSrc = normalizeMcqImageSrc(match[1]);
      if (imageSrc) {
        parts.push({ kind: 'image', value: imageSrc });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      parts.push({ kind: 'text', value: normalizeMathSegment(raw.slice(lastIndex)) });
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
        return <span key={`math-text-${index}`}>{segment.value}</span>;
      })}
    </span>
  );
}
