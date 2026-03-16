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

function hasHtmlTags(value: string) {
  return /<\/?[a-z][^>]*>/i.test(String(value || ''));
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(rawValue: string) {
  const escaped = escapeHtml(rawValue).replace(/\r\n/g, '\n');
  const withInlineFormatting = escaped
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, '$1<i>$2</i>')
    .replace(/\^([A-Za-z0-9()+\-]+)/g, '<sup>$1</sup>')
    .replace(/~([A-Za-z0-9()+\-]+)/g, '<sub>$1</sub>');

  const lines = withInlineFormatting.split('\n');
  const chunks: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;

  const closeLists = () => {
    if (inUnorderedList) {
      chunks.push('</ul>');
      inUnorderedList = false;
    }
    if (inOrderedList) {
      chunks.push('</ol>');
      inOrderedList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    const unorderedMatch = trimmed.match(/^[-*\u2022]\s+(.+)$/);
    if (unorderedMatch) {
      if (inOrderedList) {
        chunks.push('</ol>');
        inOrderedList = false;
      }
      if (!inUnorderedList) {
        chunks.push('<ul>');
        inUnorderedList = true;
      }
      chunks.push(`<li>${unorderedMatch[1]}</li>`);
      return;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      if (inUnorderedList) {
        chunks.push('</ul>');
        inUnorderedList = false;
      }
      if (!inOrderedList) {
        chunks.push('<ol>');
        inOrderedList = true;
      }
      chunks.push(`<li>${orderedMatch[1]}</li>`);
      return;
    }

    closeLists();
    if (!trimmed) {
      chunks.push('<br/>');
      return;
    }
    chunks.push(`<p>${trimmed}</p>`);
  });

  closeLists();
  return chunks.join('');
}

function sanitizeRichHtml(rawHtml: string) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml;
  }

  const allowedTags = new Set(['b', 'strong', 'i', 'em', 'u', 'sup', 'sub', 'ul', 'ol', 'li', 'p', 'br', 'span']);
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const container = doc.body.firstElementChild as HTMLElement | null;
  if (!container) return '';

  const sanitizeNode = (node: Node) => {
    const children = Array.from(node.childNodes);
    children.forEach((child) => sanitizeNode(child));

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();

    if (!allowedTags.has(tag)) {
      const parent = element.parentNode;
      if (!parent) return;
      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }
      parent.removeChild(element);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      element.removeAttribute(attribute.name);
    });
  };

  sanitizeNode(container);
  return container.innerHTML;
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

  const normalizedHtml = useMemo(() => {
    const raw = String(value || '');
    if (!raw.trim()) return '';

    let richText = raw;
    if (!hasHtmlTags(raw)) {
      richText = markdownToHtml(raw);
    }

    const mathReadyText = hasMathDelimiters(richText) || !looksLikeMath(raw)
      ? richText
      : `\\(${richText}\\)`;

    return sanitizeRichHtml(mathReadyText);
  }, [value]);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    const mathJax = window.MathJax;
    if (!mathJax?.typesetPromise) return;

    void mathJax.typesetPromise([node]).catch(() => {
      // Keep UI responsive even if MathJax fails on malformed expressions.
    });
  }, [normalizedHtml]);

  if (!normalizedHtml) return null;

  return (
    <span
      ref={hostRef}
      className={`math-content ${asBlock ? 'block' : ''} ${className || ''}`.trim()}
      style={{ whiteSpace: 'normal' }}
      dangerouslySetInnerHTML={{ __html: normalizedHtml }}
    />
  );
}
