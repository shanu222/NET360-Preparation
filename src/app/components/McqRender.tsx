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

function stripInlineLatexDelimiters(value: string) {
  return String(value || '').replace(/\\\(|\\\)/g, '');
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  const html = useMemo(() => {
    const raw = stripInlineLatexDelimiters(String(value || ''));
    if (!raw.trim()) return '';

    const imagePlaceholders: string[] = [];
    const withPlaceholders = raw.replace(INLINE_IMAGE_TOKEN_REGEX, (_, tokenSrc: string) => {
      const normalized = normalizeMcqImageSrc(tokenSrc);
      if (!normalized || !/^data:image\//i.test(normalized)) return '';
      const placeholder = `__MCQ_IMG_${imagePlaceholders.length}__`;
      imagePlaceholders.push(normalized);
      return placeholder;
    });

    const allowTags = new Set(['strong', 'b', 'em', 'i', 'br']);

    const sanitizeNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        const normalized = normalizeMathSegment(String(node.textContent || ''));
        return escapeHtml(normalized);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return '';

      const element = node as Element;
      const tag = String(element.tagName || '').toLowerCase();

      if (tag === 'br') return '<br />';

      const body = Array.from(element.childNodes || []).map((child) => sanitizeNode(child)).join('');
      if (!body) return '';

      if (!allowTags.has(tag)) return body;
      return `<${tag}>${body}</${tag}>`;
    };

    let safeHtml = '';

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(`<div>${withPlaceholders}</div>`, 'text/html');
      const nodes = Array.from(doc.body.firstChild?.childNodes || []);
      safeHtml = nodes.map((node) => sanitizeNode(node)).join('');
    } else {
      safeHtml = escapeHtml(normalizeMathSegment(withPlaceholders));
    }

    return safeHtml.replace(/__MCQ_IMG_(\d+)__/g, (_match, indexValue: string) => {
      const src = imagePlaceholders[Number(indexValue)] || '';
      if (!src) return '';
      return `<img src="${src}" alt="Embedded MCQ visual" class="mcq-inline-image" />`;
    });
  }, [value]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;

    void mathJax.typesetPromise([node]).catch(() => {
      // Keep UI responsive even if MathJax fails on malformed expressions.
    });
  }, [html]);

  if (!html) return null;

  return (
    <span
      ref={hostRef}
      className={`math-content ${asBlock ? 'block' : ''} ${className || ''}`.trim()}
      style={{ whiteSpace: 'pre-wrap' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
