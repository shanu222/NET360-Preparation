import { useEffect, useMemo, useRef } from 'react';

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

function looksLikeMath(value: string) {
  return /\\[a-zA-Z]+|[∫∑√π≤≥≈≠±∞α-ωΑ-Ω₀-₉⁰-⁹]|[A-Za-z0-9)\]}][_^][A-Za-z0-9+-]+/.test(String(value || ''));
}

function hasMathDelimiters(value: string) {
  return /\\\(|\\\[|\$\$?|\\begin\{/.test(String(value || ''));
}

function sanitizeLatexScripts(value: string) {
  const raw = String(value || '');

  // Convert common shorthand like H_2 or x^2 into braced TeX to avoid parser errors.
  const normalized = raw.replace(/([A-Za-z0-9)\]}])([_^])([A-Za-z0-9+-]+)/g, '$1$2{$3}');

  // Escape any remaining unbraced script operators so they render as plain text.
  return normalized.replace(/(^|[^\\])([_^])(?!\{)/g, '$1\\$2');
}

function normalizeDollarMathDelimiters(value: string) {
  const input = String(value || '');
  if (!input.includes('$')) return input;

  const shouldConvertInline = (content: string) => {
    const trimmed = String(content || '').trim();
    if (!trimmed) return false;
    // Avoid converting likely currency-only content while converting scientific latex/math.
    if (/^\d+(?:[.,]\d+)?%?$/.test(trimmed)) return false;
    return true;
  };

  const normalizedDisplay = input.replace(/(^|[^\\])\$\$([\s\S]*?)\$\$/g, (_full, prefix, expr) => {
    const expression = String(expr || '').trim();
    if (!expression) return _full;
    return `${prefix}\\[${expression}\\]`;
  });

  const mergedScriptNotation = normalizedDisplay.replace(/([A-Za-z0-9)\]}])\$([_^][^\n$]+?)\$/g, (_full, base, expr) => {
    const expression = String(expr || '').trim();
    if (!expression) return _full;
    return `\\(${base}${expression}\\)`;
  });

  return mergedScriptNotation.replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_full, prefix, expr) => {
    const expression = String(expr || '').trim();
    if (!expression || !shouldConvertInline(expression)) return _full;
    return `${prefix}\\(${expression}\\)`;
  });
}

const INLINE_MEDIA_TOKEN_REGEX = /\[\[(?:imgrow:(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\|(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)|img:(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+))\]\]/gi;
const INLINE_FORMAT_TAG_REGEX = /<(strong|b|em|i)>([\s\S]*?)<\/\s*(strong|b|em|i)\s*>/gi;

function normalizeMathSegment(value: string) {
  const raw = String(value || '');
  if (!raw.trim()) return '';
  const withNormalizedDollarDelimiters = normalizeDollarMathDelimiters(raw);
  if (hasMathDelimiters(withNormalizedDollarDelimiters)) return withNormalizedDollarDelimiters;
  const sanitized = sanitizeLatexScripts(withNormalizedDollarDelimiters);
  if (looksLikeMath(sanitized)) return `\\(${sanitized}\\)`;
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
    if (!raw.trim()) return [] as Array<{ kind: 'text' | 'image' | 'image-row' | 'bold' | 'italic'; value: string }>;

    const parts: Array<{ kind: 'text' | 'image' | 'image-row' | 'bold' | 'italic'; value: string }> = [];
    const pushRichTextParts = (input: string) => {
      const plain = String(input || '');
      if (!plain) return;

      let formatLastIndex = 0;
      let formatMatch: RegExpExecArray | null;
      const formatRegex = new RegExp(INLINE_FORMAT_TAG_REGEX.source, 'gi');

      while ((formatMatch = formatRegex.exec(plain))) {
        const formatStart = formatMatch.index;
        if (formatStart > formatLastIndex) {
          parts.push({ kind: 'text', value: normalizeMathSegment(plain.slice(formatLastIndex, formatStart)) });
        }

        const openingTag = String(formatMatch[1] || '').toLowerCase();
        const closingTag = String(formatMatch[3] || '').toLowerCase();
        if (openingTag !== closingTag) {
          parts.push({ kind: 'text', value: normalizeMathSegment(formatMatch[0]) });
        } else {
          const formatValue = normalizeMathSegment(String(formatMatch[2] || ''));
          if (formatValue) {
            parts.push({ kind: openingTag === 'strong' || openingTag === 'b' ? 'bold' : 'italic', value: formatValue });
          }
        }

        formatLastIndex = formatRegex.lastIndex;
      }

      if (formatLastIndex < plain.length) {
        parts.push({ kind: 'text', value: normalizeMathSegment(plain.slice(formatLastIndex)) });
      }
    };
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(INLINE_MEDIA_TOKEN_REGEX.source, 'gi');

    while ((match = regex.exec(raw))) {
      const tokenStart = match.index;
      if (tokenStart > lastIndex) {
        pushRichTextParts(raw.slice(lastIndex, tokenStart));
      }

      const rowLeft = normalizeMcqImageSrc(match[1]);
      const rowRight = normalizeMcqImageSrc(match[2]);
      const singleImage = normalizeMcqImageSrc(match[3]);
      if (rowLeft && rowRight) {
        parts.push({ kind: 'image-row', value: `${rowLeft}|${rowRight}` });
      } else if (singleImage) {
        parts.push({ kind: 'image', value: singleImage });
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

  const shouldTypeset = useMemo(() => {
    return segments.some((segment) => {
      if (segment.kind === 'image' || segment.kind === 'image-row') return false;
      return hasMathDelimiters(segment.value);
    });
  }, [segments]);

  useEffect(() => {
    if (!shouldTypeset) return;
    const node = hostRef.current;
    if (!node) return;
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;

    void mathJax.typesetPromise([node]).catch(() => {
      // Keep UI responsive even if MathJax fails on malformed expressions.
    });
  }, [segments, shouldTypeset]);

  if (!segments.length) return null;

  return (
    <span
      ref={hostRef}
      className={`math-content ${asBlock ? 'block' : ''} ${className || ''}`.trim()}
      style={{ whiteSpace: 'pre-wrap' }}
    >
      {segments.map((segment, index) => {
        if (segment.kind === 'image-row') {
          const [leftSrc, rightSrc] = String(segment.value || '').split('|');
          if (!leftSrc || !rightSrc) return null;
          return (
            <span key={`math-image-row-${index}`} className="mcq-inline-image-row">
              <img src={leftSrc} alt={`Embedded MCQ visual ${index + 1} left`} className="mcq-inline-image" />
              <img src={rightSrc} alt={`Embedded MCQ visual ${index + 1} right`} className="mcq-inline-image" />
            </span>
          );
        }

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
          if (!segment.value) return null;
          return <strong key={`math-bold-${index}`}>{segment.value}</strong>;
        }

        if (segment.kind === 'italic') {
          if (!segment.value) return null;
          return <em key={`math-italic-${index}`}>{segment.value}</em>;
        }

        return <span key={`math-text-${index}`}>{segment.value}</span>;
      })}
    </span>
  );
}
