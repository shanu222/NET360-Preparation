import { createElement, type ChangeEvent, type FormEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookCheck,
  Boxes,
  ClipboardList,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileCheck2,
  FileQuestion,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiRequest, buildApiUrl, buildSseStreamUrl } from '../app/lib/api';
import { COOKIE_SESSION_API_MARKER } from '../app/lib/authSession';
import { dedupeNormalizedStrings, normalizeHierarchyLabel } from '../app/lib/hierarchyDedup';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Tabs, TabsContent } from '../app/components/ui/tabs';
import { Badge } from '../app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Textarea } from '../app/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../app/components/ui/alert-dialog';
import { toast } from 'sonner';
import { COMPUTER_SCIENCE_SYLLABUS, FLAT_TOPIC_TABS, INTELLIGENCE_SYLLABUS, SYLLABUS } from '../app/components/Preparation';
import type { SubjectKey } from '../app/lib/mcq';
import {
  downloadBlobFile,
  downloadDataUrlFile,
  openBlobPreview,
  openDataUrlPreview,
} from '../app/lib/filePreview';
import { McqMathText, normalizeMcqImageSrc } from '../app/components/McqRender';
import 'mathlive';
import '../styles/admin-theme.css';

const FLAT_TOPIC_SUBJECTS = new Set(['quantitative-mathematics', 'design-aptitude']);
const PART_SELECTION_SUBJECTS = new Set(['mathematics', 'physics', 'chemistry', 'biology', 'english']);
const ADMIN_SUPPORT_DESKTOP_ALERTS_KEY = 'net360-support-desktop-alerts-admin';
const ADMIN_SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const ADMIN_SUPPORT_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg';
const ADMIN_SUPPORT_REACTIONS = ['😀', '🙏', '👍', '❤️', '✅'];
const ADMIN_SIDEBAR_EXPANDED_KEY = 'net360-admin-sidebar-expanded';
const ADMIN_DESKTOP_MIN_WIDTH = 1024;
const ADMIN_TABLET_COLLAPSE_MAX_WIDTH = 1280;
const ADMIN_BRAND_LOGO_SRC = '/net360-logo.png';
const ADMIN_MCQ_TEST_PREVIEW_STORAGE_KEY = 'net360-admin-mcq-test-preview';

type MathFieldLikeElement = HTMLElement & {
  getValue: (format?: 'latex' | 'math-json' | 'spoken') => string;
  setValue: (value: string, options?: { silenceNotifications?: boolean }) => void;
  insert?: (value: string, options?: { insertionMode?: 'replaceSelection' | 'insertBefore' | 'insertAfter' }) => void;
  executeCommand?: (command: unknown) => void;
};

type ClipboardDataEvent = {
  clipboardData: DataTransfer | null;
  preventDefault: () => void;
};

type ManualImageEditorTarget =
  | { kind: 'question' }
  | { kind: 'option'; optionIndex: number; optionKey: string }
  | { kind: 'explanation' };

type GestureCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GestureCropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type GestureImageEditorState = {
  isOpen: boolean;
  sourceDataUrl: string;
  fileName: string;
  target: ManualImageEditorTarget | null;
  naturalWidth: number;
  naturalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  rotation: number;
  translateX: number;
  translateY: number;
  crop: GestureCropRect;
};

function normalizeMathInputId(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'math-input';
}

function insertMathSymbolToField(targetId: string, snippet = '\\sqrt{}') {
  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (!field) return;

  try {
    if (typeof field.insert === 'function') {
      field.insert(snippet, { insertionMode: 'replaceSelection' });
    } else if (typeof field.executeCommand === 'function') {
      field.executeCommand(['insert', snippet]);
    } else {
      field.setValue(`${field.getValue('latex')}${snippet}`);
    }

    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  } catch {
    // Keep the editor usable even if symbol insertion is not supported on a platform.
  }
}

function focusMathField(targetId: string) {
  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (!field) return;

  try {
    if (typeof field.executeCommand === 'function') {
      field.executeCommand('toggleVirtualKeyboard');
    }
  } catch {
    // Keep focus behavior resilient even if keyboard toggle is unsupported.
  }

  field.focus();
}

function insertTextToField(targetId: string, text: string) {
  const snippet = String(text || '');
  if (!snippet) return;

  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (!field) return;

  try {
    if (typeof field.insert === 'function') {
      field.insert(snippet, { insertionMode: 'replaceSelection' });
    } else if (typeof field.executeCommand === 'function') {
      field.executeCommand(['insert', snippet]);
    } else {
      field.setValue(`${field.getValue('latex')}${snippet}`);
    }

    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
  } catch {
    // Keep editor input usable even if insertion is unsupported on a platform.
  }
}

function insertImageTokenToField(targetId: string, dataUrl: string) {
  const normalized = String(dataUrl || '').trim();
  if (!normalized) return;

  insertTextToField(targetId, `[[img:${normalized}]]`);
}

const INLINE_IMAGE_TOKEN_PATTERN = /\[\[img:(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\]\]/gi;
const INLINE_IMAGE_ROW_TOKEN_PATTERN = /\[\[imgrow:(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\|(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+)\]\]/gi;

function replaceFieldValue(targetId: string, nextValue: string) {
  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (!field) return false;

  field.setValue(String(nextValue || ''), { silenceNotifications: false });
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  return true;
}

function findLastInlineImageToken(value: string):
  | { kind: 'img'; start: number; end: number; raw: string; image: string }
  | { kind: 'row'; start: number; end: number; raw: string; left: string; right: string }
  | null {
  const raw = String(value || '');

  let last:
    | { kind: 'img'; start: number; end: number; raw: string; image: string }
    | { kind: 'row'; start: number; end: number; raw: string; left: string; right: string }
    | null = null;

  const imageRegex = new RegExp(INLINE_IMAGE_TOKEN_PATTERN.source, 'gi');
  let imageMatch: RegExpExecArray | null;
  while ((imageMatch = imageRegex.exec(raw))) {
    last = {
      kind: 'img',
      start: imageMatch.index,
      end: imageRegex.lastIndex,
      raw: imageMatch[0],
      image: String(imageMatch[1] || ''),
    };
  }

  const rowRegex = new RegExp(INLINE_IMAGE_ROW_TOKEN_PATTERN.source, 'gi');
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(raw))) {
    const candidate = {
      kind: 'row' as const,
      start: rowMatch.index,
      end: rowRegex.lastIndex,
      raw: rowMatch[0],
      left: String(rowMatch[1] || ''),
      right: String(rowMatch[2] || ''),
    };
    if (!last || candidate.start >= last.start) {
      last = candidate;
    }
  }

  return last;
}

function resolveImagePlacementChoice(): 'cursor' | 'below' | 'above' | 'left' | 'right' {
  const raw = String(window.prompt(
    'Place new image: 1 Cursor, 2 Below previous, 3 Above previous, 4 Left of previous, 5 Right of previous',
    '1',
  ) || '').trim().toLowerCase();

  if (raw === '2' || raw === 'below' || raw === 'b') return 'below';
  if (raw === '3' || raw === 'above' || raw === 'a') return 'above';
  if (raw === '4' || raw === 'left' || raw === 'l') return 'left';
  if (raw === '5' || raw === 'right' || raw === 'r') return 'right';
  return 'cursor';
}

function insertImageTokenSmartToField(targetId: string, dataUrl: string) {
  const normalized = String(dataUrl || '').trim();
  if (!normalized) return;

  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (!field) return;

  const currentValue = String(field.getValue('latex') || '');
  const previousToken = findLastInlineImageToken(currentValue);

  if (!previousToken) {
    insertImageTokenToField(targetId, normalized);
    return;
  }

  const choice = resolveImagePlacementChoice();
  const newToken = `[[img:${normalized}]]`;

  if (choice === 'cursor') {
    insertImageTokenToField(targetId, normalized);
    return;
  }

  if (choice === 'left' || choice === 'right') {
    if (previousToken.kind === 'img') {
      const rowToken = choice === 'left'
        ? `[[imgrow:${normalized}|${previousToken.image}]]`
        : `[[imgrow:${previousToken.image}|${normalized}]]`;
      const merged = `${currentValue.slice(0, previousToken.start)}${rowToken}${currentValue.slice(previousToken.end)}`;
      replaceFieldValue(targetId, merged);
      return;
    }

    // Keep existing row intact and avoid destructive replacement when the previous token is already a row.
    const fallback = `${currentValue}\n${newToken}`;
    replaceFieldValue(targetId, fallback);
    return;
  }

  if (choice === 'above') {
    const nextValue = `${currentValue.slice(0, previousToken.start)}${newToken}\n${previousToken.raw}${currentValue.slice(previousToken.end)}`;
    replaceFieldValue(targetId, nextValue);
    return;
  }

  const nextValue = `${currentValue.slice(0, previousToken.end)}\n${newToken}${currentValue.slice(previousToken.end)}`;
  replaceFieldValue(targetId, nextValue);
}

function insertImageTokenToFieldWithRetry(targetId: string, dataUrl: string, attempt = 0) {
  const normalized = String(dataUrl || '').trim();
  if (!normalized) return;

  const field = document.getElementById(targetId) as MathFieldLikeElement | null;
  if (field) {
    insertImageTokenSmartToField(targetId, normalized);
    return;
  }

  if (attempt >= 18) return;
  window.setTimeout(() => {
    insertImageTokenToFieldWithRetry(targetId, normalized, attempt + 1);
  }, 22);
}

function extractRichBoldTextFromClipboard(event: ClipboardDataEvent): string {
  const html = String(event.clipboardData?.getData('text/html') || '').trim();
  if (!html || typeof DOMParser === 'undefined') return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const inlineTags = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'a']);
  const blockTags = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

  const normalizeTagText = (value: string) =>
    String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const nodeToRichText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return String(node.textContent || '');
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const element = node as Element;
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'br') return '\n';

    if (tag === 'img') return '';

    const styleAttr = String(element.getAttribute('style') || '').toLowerCase();
    const isBoldTag = tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr);
    const isItalicTag = tag === 'em' || tag === 'i' || /font-style\s*:\s*(italic|oblique)/i.test(styleAttr);
    const childText = Array.from(element.childNodes).map((child) => nodeToRichText(child)).join('');
    let wrappedText = childText;
    if (isItalicTag && childText.trim()) {
      wrappedText = `<em>${wrappedText}</em>`;
    }
    if (isBoldTag && childText.trim()) {
      wrappedText = `<strong>${wrappedText}</strong>`;
    }

    if (blockTags.has(tag) || !inlineTags.has(tag)) {
      return `\n${wrappedText}\n`;
    }

    return wrappedText;
  };

  const raw = Array.from(doc.body.childNodes || []).map((node) => nodeToRichText(node)).join('');
  const normalized = normalizeTagText(raw)
    .replace(/<[^>]*>/g, (token) => {
      const cleaned = String(token || '').trim();
      if (/^<\s*(strong|b)\b[^>]*>$/i.test(cleaned)) return '<strong>';
      if (/^<\s*\/\s*(strong|b)\s*>$/i.test(cleaned)) return '</strong>';
      if (/^<\s*(em|i)\b[^>]*>$/i.test(cleaned)) return '<em>';
      if (/^<\s*\/\s*(em|i)\s*>$/i.test(cleaned)) return '</em>';
      return '';
    });

  return normalized;
}

function extractPlainTextFromClipboard(event: ClipboardDataEvent): string {
  const text = String(event.clipboardData?.getData('text/plain') || '');
  return text.replace(/\r\n/g, '\n');
}

async function extractPastedImageDataUrl(event: ClipboardDataEvent): Promise<string | null> {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return null;

  const imageItem = Array.from(clipboardData.items || []).find((item) => String(item.type || '').toLowerCase().startsWith('image/'));
  const itemFile = imageItem?.getAsFile() || null;
  const fileFallback = Array.from(clipboardData.files || []).find((entry) =>
    String(entry.type || '').toLowerCase().startsWith('image/'),
  ) || null;
  const file = itemFile || fileFallback;
  if (!file) return null;
  if (!isSupportedMcqImage(file)) {
    toast.error('Unsupported pasted image format. Use JPG, PNG, WEBP, SVG, or GIF.');
    return null;
  }
  if (file.size > MCQ_IMAGE_MAX_BYTES) {
    toast.error('Pasted image is too large. Maximum size is 5 MB.');
    return null;
  }

  return fileToDataUrl(file);
}

const SHARED_MATH_TOOLBAR_ACTIONS: Array<{ label: string; snippet?: string; action: 'focus' | 'insert' }> = [
  { label: 'Math Calc', action: 'focus' },
  { label: 'Symbol', action: 'insert', snippet: '\\pm' },
  { label: 'Fraction', action: 'insert', snippet: '\\frac{}{}' },
  { label: 'Power', action: 'insert', snippet: 'x^{}' },
  { label: 'Sqrt', action: 'insert', snippet: '\\sqrt{}' },
  { label: 'Pi', action: 'insert', snippet: '\\pi' },
  { label: 'Sci', action: 'insert', snippet: '\\times 10^{}' },
];

function MathEditorField({
  id,
  label,
  value,
  placeholder,
  className,
  onValueChange,
  onImagePaste,
  insertImageTokenOnPaste,
  onPasteIntercept,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  className?: string;
  onValueChange: (nextValue: string) => void;
  onImagePaste?: (dataUrl: string) => void;
  insertImageTokenOnPaste?: boolean;
  onPasteIntercept?: (event: ClipboardDataEvent) => boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-wrap items-center gap-1">
          {SHARED_MATH_TOOLBAR_ACTIONS.map((item) => (
            <Button
              key={`${id}-${item.label}`}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                if (item.action === 'focus') {
                  focusMathField(id);
                  return;
                }
                insertMathSymbolToField(id, item.snippet || '\\sqrt{}');
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <MathLiveInput
        id={id}
        value={value}
        placeholder={placeholder}
        className={className}
        onValueChange={onValueChange}
        onImagePaste={onImagePaste}
        insertImageTokenOnPaste={insertImageTokenOnPaste}
        onPasteIntercept={onPasteIntercept}
      />
    </div>
  );
}

function MathLiveInput({
  id,
  value,
  placeholder,
  className,
  onValueChange,
  onImagePaste,
  insertImageTokenOnPaste,
  onPasteIntercept,
}: {
  id: string;
  value: string;
  placeholder?: string;
  className?: string;
  onValueChange: (nextValue: string) => void;
  onImagePaste?: (dataUrl: string) => void;
  insertImageTokenOnPaste?: boolean;
  onPasteIntercept?: (event: ClipboardDataEvent) => boolean;
}) {
  const fieldRef = useRef<MathFieldLikeElement | null>(null);
  const lastHandledPasteRef = useRef(0);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const processClipboard = (clipboardEvent: ClipboardDataEvent) => {
      const richText = extractRichBoldTextFromClipboard(clipboardEvent);
      if (richText) {
        clipboardEvent.preventDefault();
        insertTextToField(id, richText);
        return true;
      }

      const hasImageClipboardItem = Array.from(clipboardEvent.clipboardData?.items || []).some((item) =>
        String(item.type || '').toLowerCase().startsWith('image/'),
      ) || Array.from(clipboardEvent.clipboardData?.files || []).some((entry) =>
        String(entry.type || '').toLowerCase().startsWith('image/'),
      );

      if (hasImageClipboardItem) {
        clipboardEvent.preventDefault();
        void extractPastedImageDataUrl(clipboardEvent)
          .then((dataUrl) => {
            if (!dataUrl) return;
            onImagePaste?.(dataUrl);
            if (insertImageTokenOnPaste !== false) {
              insertImageTokenSmartToField(id, dataUrl);
            }
          })
          .catch(() => {
            // Keep editor usable even if image extraction fails.
          });
        return true;
      }

      const plainText = extractPlainTextFromClipboard(clipboardEvent);
      if (plainText) {
        clipboardEvent.preventDefault();
        insertTextToField(id, plainText);
        return true;
      }

      return false;
    };

    const handleInput = () => {
      onValueChange(field.getValue('latex'));
    };

    const handlePaste = (event: Event) => {
      const clipboardEvent = event as unknown as ClipboardDataEvent;
      if (onPasteIntercept?.(clipboardEvent)) {
        return;
      }

      if (processClipboard(clipboardEvent)) {
        lastHandledPasteRef.current = Date.now();
      }
    };

    const handleBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent & { dataTransfer?: DataTransfer | null };
      if (inputEvent.inputType !== 'insertFromPaste') return;
      if (Date.now() - lastHandledPasteRef.current < 80) return;

      const dataTransfer = inputEvent.dataTransfer || null;
      if (!dataTransfer) return;

      const syntheticClipboardEvent: ClipboardDataEvent = {
        clipboardData: dataTransfer,
        preventDefault: () => inputEvent.preventDefault(),
      };

      if (onPasteIntercept?.(syntheticClipboardEvent)) {
        return;
      }

      if (processClipboard(syntheticClipboardEvent)) {
        lastHandledPasteRef.current = Date.now();
      }
    };

    field.addEventListener('input', handleInput);
    field.addEventListener('paste', handlePaste);
    field.addEventListener('beforeinput', handleBeforeInput);
    return () => {
      field.removeEventListener('input', handleInput);
      field.removeEventListener('paste', handlePaste);
      field.removeEventListener('beforeinput', handleBeforeInput);
    };
  }, [id, insertImageTokenOnPaste, onImagePaste, onPasteIntercept, onValueChange]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const currentValue = field.getValue('latex');
    const nextValue = String(value || '');
    if (currentValue !== nextValue) {
      field.setValue(nextValue, { silenceNotifications: true });
    }
  }, [value]);

  return createElement('math-field', {
    id,
    ref: (node: MathFieldLikeElement | null) => {
      fieldRef.current = node;
    },
    class: `block min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${className || ''}`.trim(),
    placeholder: placeholder || '',
    'virtual-keyboard-mode': 'onfocus',
    'smart-mode': 'false',
  } as Record<string, unknown>);
}

function toTitleLabel(value: string) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSubjectKey(value: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSyllabusChapterKey(value: string) {
  return normalizeHierarchyLabel(value);
}

function isPartSelectionRequiredSubject(value: string) {
  return PART_SELECTION_SUBJECTS.has(normalizeSubjectKey(value));
}

function readStoredAdminSidebarPreference() {
  try {
    const stored = localStorage.getItem(ADMIN_SIDEBAR_EXPANDED_KEY);
    if (stored == null) return null;
    return stored !== '0';
  } catch {
    return null;
  }
}

function isTabletSidebarViewport(width: number) {
  return width >= ADMIN_DESKTOP_MIN_WIDTH && width < ADMIN_TABLET_COLLAPSE_MAX_WIDTH;
}

type SelectedHierarchy =
  | {
      kind: 'section';
      subject: SubjectKey;
      part: 'part1' | 'part2' | '';
      chapterTitle: string;
      sectionTitle: string;
    }
  | {
      kind: 'flat-topic';
      subject: 'quantitative-mathematics' | 'design-aptitude';
      chapterTitle: '';
      sectionTitle: string;
    };

type AdminSection =
  | 'dashboard'
  | 'users'
  | 'requests'
  | 'premium-requests'
  | 'support-chat'
  | 'password-recovery'
  | 'security-info'
  | 'mcqs'
  | 'practice-board'
  | 'submissions'
  | 'community-moderation'
  | 'subscriptions'
  | 'system-config';

const ADMIN_SECTION_ROUTES: Record<AdminSection, string> = {
  dashboard: '/admin/dashboard',
  users: '/admin/users',
  requests: '/admin/signup-requests',
  'premium-requests': '/admin/premium-requests',
  'support-chat': '/admin/support-chat',
  'password-recovery': '/admin/password-recovery',
  'security-info': '/admin/security-info',
  mcqs: '/admin/mcqs',
  'practice-board': '/admin/practice-board',
  submissions: '/admin/submissions',
  'community-moderation': '/admin/community-moderation',
  subscriptions: '/admin/subscriptions',
  'system-config': '/admin/system-config',
};

const ADMIN_SECTION_META: Array<{ section: AdminSection; label: string; icon: LucideIcon }> = [
  { section: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'users', label: 'Users', icon: Users },
  { section: 'mcqs', label: 'MCQs', icon: FileQuestion },
  { section: 'practice-board', label: 'Practice Board', icon: BookCheck },
  { section: 'submissions', label: 'Submissions', icon: FileCheck2 },
  { section: 'community-moderation', label: 'Community', icon: ShieldAlert },
  { section: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { section: 'support-chat', label: 'Support Chat', icon: MessageSquare },
  { section: 'requests', label: 'Signup Requests', icon: ClipboardList },
  { section: 'premium-requests', label: 'Premium Requests', icon: Sparkles },
  { section: 'password-recovery', label: 'Recovery', icon: Activity },
  { section: 'security-info', label: 'Security Info', icon: KeyRound },
  { section: 'system-config', label: 'Settings', icon: Settings },
];

function getSectionFromPath(pathname: string): AdminSection {
  const normalized = String(pathname || '').toLowerCase();

  if (!normalized.startsWith('/admin')) return 'dashboard';
  if (normalized === '/admin' || normalized === '/admin/') return 'dashboard';
  if (normalized.startsWith('/admin/dashboard')) return 'dashboard';
  if (normalized.startsWith('/admin/users')) return 'users';
  if (normalized.startsWith('/admin/signup-requests')) return 'requests';
  if (normalized.startsWith('/admin/premium-requests')) return 'premium-requests';
  if (normalized.startsWith('/admin/support-chat')) return 'support-chat';
  if (normalized.startsWith('/admin/security-info')) return 'security-info';
  if (normalized.startsWith('/admin/password-recovery')) return 'password-recovery';
  if (normalized.startsWith('/admin/mcqs')) return 'mcqs';
  if (normalized.startsWith('/admin/practice-board')) return 'practice-board';
  if (normalized.startsWith('/admin/submissions')) return 'submissions';
  if (normalized.startsWith('/admin/community-moderation')) return 'community-moderation';
  if (normalized.startsWith('/admin/subscriptions')) return 'subscriptions';
  if (normalized.startsWith('/admin/system-config')) return 'system-config';

  return 'dashboard';
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobileNumber?: string;
  role: 'student' | 'admin';
  createdAt: string | null;
}

interface AdminOverview {
  usersCount: number;
  mcqCount: number;
  attemptsCount: number;
  averageScore: number;
  pendingSignupRequests?: number;
  pendingPremiumRequests?: number;
  recoveryRequestCount?: number;
  recoveryStatusCounts?: {
    sent: number;
    partial: number;
    failed: number;
    not_found: number;
  };
  pendingQuestionSubmissions?: number;
}

interface AdminSystemStatus {
  openai: {
    configured: boolean;
    model: string;
    keySource: string;
  };
  serverTime: string;
}

interface AdminConfigVariable {
  key: string;
  isSecret: boolean;
  description: string;
  updatedByEmail: string;
  updatedAt: string | null;
  valuePreview: string;
}

interface PasswordRecoveryRequest {
  id: string;
  identifier: string;
  matchedBy: 'email' | 'mobile' | 'none';
  userId: string;
  userName: string;
  email: string;
  mobileNumber: string;
  recoveryStatus: 'not_found' | 'sent' | 'partial' | 'failed';
  dispatches: Array<{
    channel: 'email' | 'sms' | 'whatsapp';
    destination: string;
    status: 'sent' | 'skipped' | 'failed';
    provider: string;
    detail: string;
  }>;
  tokenExpiresAt: string | null;
  createdAt: string | null;
}

interface AdminSecurityInfoRow {
  userId: string;
  email: string;
  securityQuestion: string;
  hasSecurityAnswerHash: boolean;
  securityAnswerNote: string;
}

interface AdminQuestionSubmissionAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface AdminQuestionSubmission {
  id: string;
  subject: string;
  questionText: string;
  questionDescription?: string;
  questionSource?: string;
  submissionReason?: string;
  attachments: AdminQuestionSubmissionAttachment[];
  status: 'pending' | 'approved' | 'rejected';
  queuedForBank?: boolean;
  submittedByName?: string;
  submittedByEmail?: string;
  submittedByUserId?: string;
  submittedByClientId?: string;
  actorKey?: string;
  moderation?: {
    result?: 'approved' | 'rejected' | 'manual-override';
    reasons?: string[];
    score?: number;
    blockedActor?: boolean;
    reviewedAt?: string | null;
  };
  reviewNotes?: string;
  reviewedByEmail?: string;
  reviewedAt?: string | null;
  createdAt?: string | null;
}

interface AdminContributionPolicy {
  maxSubmissionsPerDay: number;
  maxFilesPerSubmission: number;
  maxFileSizeBytes: number;
  blockDurationMinutes: number;
  updatedByEmail?: string;
}

interface SignupRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  paymentTransactionId: string;
  paymentProof?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    fileUrl?: string;
  };
  contactMethod?: 'in_app';
  contactValue?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
  codeDeliveryStatus?: 'not_generated' | 'pending_send' | 'sent';
  codeSentAt?: string | null;
}

interface PremiumSubscriptionRequest {
  id: string;
  userId: string;
  email: string;
  mobileNumber: string;
  planId: string;
  planName: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  paymentTransactionId: string;
  paymentProof?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    fileUrl?: string;
  };
  contactMethod: 'in_app';
  contactValue: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
  codeDeliveryStatus?: 'not_generated' | 'pending_send' | 'sent';
  codeSentAt?: string | null;
}

interface AdminMCQ {
  id: string;
  subject: string;
  part?: string;
  chapter?: string;
  section?: string;
  topic: string;
  question: string;
  questionImageUrl?: string;
  questionImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  options: string[];
  optionMedia?: Array<{
    key: string;
    text: string;
    image?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    } | null;
  }>;
  answer: string;
  answerKey?: string;
  tip: string;
  explanationText?: string;
  explanationImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  shortTrickText?: string;
  shortTrickImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  difficulty: string;
}

interface AdminMcqImageFile {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface AdminMcqOptionMedia {
  key: string;
  text: string;
  image?: AdminMcqImageFile | null;
}

interface EditableBankMcq {
  id: string;
  subject: string;
  part: string;
  chapter: string;
  section: string;
  topic: string;
  questionType: 'text' | 'image';
  question: string;
  questionImage: AdminMcqImageFile | null;
  optionMedia: AdminMcqOptionMedia[];
  optionTypes: Array<'text' | 'image'>;
  answer: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  explanationText: string;
  explanationImage: AdminMcqImageFile | null;
  shortTrickText: string;
  shortTrickImage: AdminMcqImageFile | null;
}

interface AdminMcqBankStructureItem {
  subject: string;
  part?: string;
  chapter: string;
  section: string;
  count: number;
}

interface AdminPracticeBoardQuestion {
  id: string;
  subject: string;
  difficulty: string;
  questionText: string;
  questionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  solutionText: string;
  solutionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
}

interface AdminSubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  billingCycle: string;
  pricePkr: number;
  dailyAiLimit: number;
}

interface AdminSubscriptionOverview {
  totalUsers: number;
  activeUsers: number;
  expiredUsers: number;
  plans: AdminSubscriptionPlan[];
  dailyUsage: Array<{
    day: string;
    chatCount: number;
    solverCount: number;
    tokenConsumed: number;
  }>;
}

interface AdminSubscriptionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  subscription: {
    status: string;
    planId: string;
    billingCycle: string;
    isActive: boolean;
    planName: string;
    dailyAiLimit: number;
    paymentReference?: string;
    expiresAt?: string | null;
  };
}

interface AdminCommunityReport {
  id: string;
  connectionId: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: string;
  status: string;
  moderation?: {
    result?: string;
    reasons?: string[];
    score?: number;
    violatorUserId?: string;
    autoBlocked?: boolean;
    reviewedAt?: string | null;
    reviewedByEmail?: string;
  };
  chatSnapshot: Array<{
    senderUserId: string;
    text: string;
    createdAt?: string | null;
  }>;
  createdAt: string | null;
}

interface AdminSupportConversation {
  userId: string;
  userName: string;
  email: string;
  mobileNumber: string;
  lastMessageText: string;
  lastMessageAt: string | null;
  unreadForAdmin: number;
}

interface AdminSupportMessage {
  id: string;
  userId: string;
  senderRole: 'user' | 'admin';
  messageType?: 'text' | 'file' | string;
  text: string;
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  reactions?: Array<{ emoji: string }>;
  createdAt: string | null;
}

interface AdminSupportThreadPayload {
  user: {
    id: string;
    name: string;
    email: string;
    mobileNumber: string;
    isDeleted?: boolean;
  };
  messages: AdminSupportMessage[];
}

interface LoginUser {
  id: string;
  role?: 'student' | 'admin';
}

interface ParsedBulkMcq {
  subject?: string;
  part?: string;
  chapter?: string;
  section?: string;
  topic?: string;
  question: string;
  questionImageUrl: string;
  questionImageDataUrl?: string;
  options: string[];
  optionImageDataUrls?: string[];
  answer: string;
  tip: string;
  shortTrick?: string;
  explanationImageDataUrl?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

type BulkDeleteMode = 'all' | 'subject' | 'chapter' | 'section-topic';

interface ParsedBulkResponse {
  parsed: ParsedBulkMcq[];
  errors: string[];
}

interface AiGeneratedMcqPayload {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface AiGeneratedMcqResponse {
  mcq?: AiGeneratedMcqPayload;
  mcqs?: AiGeneratedMcqPayload[];
  generatedCount?: number;
  promptFile?: string;
  errors?: string[];
}

interface AiPromptTemplateMetaResponse {
  ok?: boolean;
  subject?: string;
  promptFile?: string;
  promptLength?: number;
  preview?: string;
  error?: string;
}

const BULK_ANALYZE_DEBOUNCE_MS = 700;
const BULK_ANALYZE_MAX_ATTEMPTS = 3;
const BULK_ANALYZE_RETRY_DELAY_MS = 650;
const BULK_ANALYZE_REQUEST_TIMEOUT_MS = 120_000;
const BULK_ANALYZE_PREFLIGHT_TIMEOUT_MS = 30_000;
const API_BASE = String(
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL
    || (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_URL
    || '',
).trim().replace(/\/+$/, '');
const API_PREFIX = `${API_BASE}/api`;
const AI_PARSE_ENDPOINT = `${API_PREFIX}/ai/parse-mcqs`;
const AI_GENERATE_ENDPOINT = `${API_PREFIX}/generate-mcqs`;
const AI_GENERATE_HEALTH_ENDPOINT = `${API_PREFIX}/health`;
const API_FALLBACK_BASE = 'https://net360-preparation-production.up.railway.app';
const AI_GENERATE_TARGET_COUNT = 5;
const AI_GENERATE_RETRY_COUNT = 3;
const AI_GENERATE_RETRY_DELAY_MS = 2_500;
const AI_GENERATE_REQUEST_TIMEOUT_MS = 300_000;
const AI_GENERATE_PREFLIGHT_TIMEOUT_MS = 30_000;
const AI_GENERATE_PREFLIGHT_ATTEMPTS = 4;
const AI_GENERATE_PREFLIGHT_RETRY_DELAY_MS = 1_500;

interface AdminMcqPreviewQuestion {
  id: string;
  subject: string;
  topic: string;
  question: string;
  options: string[];
  optionMedia: AdminMcqOptionMedia[];
  questionImage: AdminMcqImageFile | null;
  answerKey?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface AdminMcqPreviewPayload {
  source: 'admin-mcq-upload-preview' | 'admin-mcq-bank-preview';
  createdAt: number;
  topic: string;
  durationMinutes: number;
  questions: AdminMcqPreviewQuestion[];
}

const TOKEN_KEY = 'net360-admin-access-token';
const REFRESH_TOKEN_KEY = 'net360-admin-refresh-token';
const THEME_STORAGE_KEY = 'net360-theme-mode';

type ThemeMode = 'light' | 'dark';

function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

function emptyForm() {
  return {
    id: '',
    subject: 'mathematics',
    part: '',
    chapter: '',
    section: '',
    topic: 'General',
    questionType: 'text' as 'text' | 'image',
    question: '',
    questionImage: null as AdminMcqImageFile | null,
    optionMedia: [
      { key: 'A', text: '', image: null },
      { key: 'B', text: '', image: null },
      { key: 'C', text: '', image: null },
      { key: 'D', text: '', image: null },
    ] as AdminMcqOptionMedia[],
    optionTypes: ['text', 'text', 'text', 'text'] as Array<'text' | 'image'>,
    answer: '',
    explanationText: '',
    explanationImage: null as AdminMcqImageFile | null,
    shortTrickText: '',
    shortTrickImage: null as AdminMcqImageFile | null,
    difficulty: 'Medium',
  };
}

function emptyPracticeForm() {
  return {
    id: '',
    subject: 'mathematics',
    difficulty: 'Medium',
    questionText: '',
    questionFile: null as AdminPracticeBoardQuestion['questionFile'],
    solutionText: '',
    solutionFile: null as AdminPracticeBoardQuestion['solutionFile'],
  };
}

function normalizeBulkText(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\s+((?:q(?:uestion)?\s*)?\d{1,3}\s*[\).:-])/gi, '$1\n$2')
    .trim();
}

function splitInlineOptions(line: string): string[] {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact) return [];

  const markerRegex = /(?:^|\s)(?:option\s*)?([A-H]|\d{1,2})(?:[\).:-])?\s+/gi;
  const markers: Array<{ label: string; markerPos: number; valueStart: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(compact))) {
    const label = String(match[1] || '').toUpperCase();
    const markerPos = compact.indexOf(label, match.index);
    markers.push({ label, markerPos, valueStart: markerRegex.lastIndex });
  }

  const startsWithMarker = /^(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+\S/i.test(compact);
  if (!markers.length || (!startsWithMarker && markers.length < 2)) {
    return [];
  }

  const extracted: string[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const end = next ? next.markerPos : compact.length;
    const segment = compact.slice(current.valueStart, end).trim();
    if (segment) extracted.push(segment);
  }

  return extracted;
}

function normalizeAnswerToken(answer: string, options: string[]): string {
  const normalizedAnswer = String(answer || '').trim();
  if (!normalizedAnswer) return '';

  const answerToken = normalizedAnswer.match(/(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (answerToken) {
    const token = answerToken[1];
    const idx = /^\d+$/.test(token)
      ? Number(token) - 1
      : token.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  const direct = options.find((option) => option.trim().toLowerCase() === normalizedAnswer.toLowerCase());
  return direct || '';
}

function extractImageReference(line: string): string {
  const raw = String(line || '').trim();
  if (!raw) return '';

  const markdownMatch = raw.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1].trim();

  const labelledMatch = raw.match(/(?:question\s*image|option\s*[A-H\d]*\s*image|explanation\s*image|solution\s*image|tip\s*image|image|img)\s*[:=-]\s*(.+)$/i);
  if (labelledMatch?.[1]) {
    const candidate = labelledMatch[1].trim();
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(candidate) || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  const urlMatch = raw.match(/(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+|https?:\/\/\S+)/i);
  return urlMatch?.[1]?.replace(/\s+/g, '') || '';
}

function splitQuestionBlocks(text: string): Array<{ number: string; content: string }> {
  const starts: Array<{ index: number; number: string }> = [];
  const startRegex = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})(?:\s*[\).:-])?\s+/gim;
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(text))) {
    starts.push({ index: match.index, number: match[1] });
  }

  if (!starts.length) {
    return [{ number: '1', content: text.trim() }];
  }

  return starts.map((entry, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return {
      number: entry.number,
      content: text.slice(entry.index, end).trim(),
    };
  });
}

function normalizeParsedHierarchyContext(context: Partial<Pick<ParsedBulkMcq, 'subject' | 'part' | 'chapter' | 'section' | 'topic'>>) {
  const subjectRaw = String(context.subject || '').trim().toLowerCase();
  const partRaw = String(context.part || '').trim().toLowerCase();
  const chapterRaw = String(context.chapter || '').trim();
  const sectionRaw = String(context.section || '').trim();
  const topicRaw = String(context.topic || '').trim();

  const normalizedPart = partRaw === 'part 1' || partRaw === 'part1'
    ? 'part1'
    : partRaw === 'part 2' || partRaw === 'part2'
      ? 'part2'
      : '';

  return {
    subject: subjectRaw,
    part: normalizedPart,
    chapter: chapterRaw,
    section: sectionRaw,
    topic: topicRaw,
  };
}

function parseHierarchyLine(line: string): { key: 'subject' | 'part' | 'chapter' | 'section' | 'topic'; value: string } | null {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const entries: Array<{ key: 'subject' | 'part' | 'chapter' | 'section' | 'topic'; re: RegExp }> = [
    { key: 'subject', re: /^(?:subject|course)\s*[:=-]\s*(.+)$/i },
    { key: 'part', re: /^part\s*[:=-]\s*(.+)$/i },
    { key: 'chapter', re: /^chapter\s*[:=-]\s*(.+)$/i },
    { key: 'section', re: /^section(?:\/topic)?\s*[:=-]\s*(.+)$/i },
    { key: 'topic', re: /^topic\s*[:=-]\s*(.+)$/i },
  ];

  for (const entry of entries) {
    const match = raw.match(entry.re);
    if (match?.[1]) {
      return {
        key: entry.key,
        value: String(match[1] || '').trim(),
      };
    }
  }

  return null;
}

function extractHierarchyContextFromText(text: string) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const context: Pick<ParsedBulkMcq, 'subject' | 'part' | 'chapter' | 'section' | 'topic'> = {
    subject: '',
    part: '',
    chapter: '',
    section: '',
    topic: '',
  };

  lines.slice(0, 120).forEach((line) => {
    const parsed = parseHierarchyLine(line);
    if (parsed?.key && parsed.value) {
      context[parsed.key] = parsed.value;
    }
  });

  return normalizeParsedHierarchyContext(context);
}

function parseBulkMcqs(raw: string): { parsed: ParsedBulkMcq[]; errors: string[] } {
  const text = normalizeBulkText(raw);
  if (!text) return { parsed: [], errors: ['Paste questions before uploading.'] };

  const baseHierarchy = extractHierarchyContextFromText(text);
  const blocks = splitQuestionBlocks(text);

  const errors: string[] = [];
  const parsed: ParsedBulkMcq[] = [];
  let skipped = 0;

  blocks.forEach((block) => {
    if (parsed.length >= 15) return;

    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    lines[0] = lines[0].replace(/^(?:q(?:uestion)?\s*)?\d{1,3}(?:\s*[\).:-])?\s*/i, '').trim();

    let questionImageUrl = '';
    let questionImageDataUrl = '';
    let answerToken = '';
    const explanationLines: string[] = [];
    let explanationImageDataUrl = '';
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    const questionLines: string[] = [];
    const options: Array<{ text: string; imageDataUrl: string }> = [];
    const blockHierarchy = {
      ...baseHierarchy,
    };
    let capturingExplanation = false;
    let activeOptionIndex = -1;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const hierarchyLine = parseHierarchyLine(line);
      if (hierarchyLine?.key) {
        blockHierarchy[hierarchyLine.key] = hierarchyLine.value;
        continue;
      }

      const imageRef = extractImageReference(line);
      if (imageRef) {
        const isDataUrl = /^data:image\//i.test(imageRef);
        const optionImageLabel = line.match(/option\s*([A-H]|\d{1,2})\s*image/i);

        if (optionImageLabel) {
          const token = optionImageLabel[1];
          const optionIndex = /^\d+$/.test(token)
            ? Number(token) - 1
            : token.toUpperCase().charCodeAt(0) - 65;
          if (optionIndex >= 0 && optionIndex < options.length) {
            options[optionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          }
          continue;
        }

        if (/explanation\s*image|solution\s*image|tip\s*image/i.test(line) || capturingExplanation) {
          explanationImageDataUrl = isDataUrl ? imageRef : explanationImageDataUrl;
          continue;
        }

        if (activeOptionIndex >= 0 && activeOptionIndex < options.length) {
          options[activeOptionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          continue;
        }

        if (isDataUrl) {
          questionImageDataUrl = imageRef;
        } else {
          questionImageUrl = imageRef;
        }
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|correct\s*option|correct|answer|ans(?:wer)?\.?)\s*[:=-]\s*(.+)$/i);
      if (answerMatch) {
        answerToken = answerMatch[1].trim();
        capturingExplanation = false;
        activeOptionIndex = -1;
        continue;
      }

      const explanationMatch = line.match(/^(?:explanation|solution|reason|short\s*trick|tip)\s*[:=-]?\s*(.*)$/i);
      if (explanationMatch) {
        if (explanationMatch[1].trim()) explanationLines.push(explanationMatch[1].trim());
        capturingExplanation = true;
        activeOptionIndex = -1;
        continue;
      }

      const difficultyMatch = line.match(/^(?:difficulty|level)\s*[:=-]\s*(easy|medium|hard)$/i);
      if (difficultyMatch) {
        const normalized = difficultyMatch[1].toLowerCase();
        difficulty = normalized === 'easy' ? 'Easy' : normalized === 'hard' ? 'Hard' : 'Medium';
        continue;
      }

      const inlineOptions = splitInlineOptions(line);
      if (inlineOptions.length) {
        inlineOptions.forEach((optionText) => {
          options.push({ text: optionText, imageDataUrl: '' });
        });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])\s*(.+)$/i);
      if (optionMatch) {
        options.push({ text: optionMatch[2].trim(), imageDataUrl: '' });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      if (capturingExplanation) {
        explanationLines.push(line);
      } else if (activeOptionIndex >= 0 && options[activeOptionIndex]) {
        options[activeOptionIndex].text = `${options[activeOptionIndex].text} ${line}`.trim();
      } else {
        questionLines.push(line);
      }
    }

    const question = questionLines.join(' ').trim();
    const normalizedOptions = options.map((option) => option.text.trim()).filter(Boolean);
    const normalizedAnswer = normalizeAnswerToken(answerToken, normalizedOptions);
    if ((!question && !questionImageUrl && !questionImageDataUrl) || normalizedOptions.length < 2 || !normalizedAnswer) {
      skipped += 1;
      return;
    }

    parsed.push({
      subject: String(blockHierarchy.subject || '').trim().toLowerCase(),
      part: String(blockHierarchy.part || '').trim().toLowerCase(),
      chapter: String(blockHierarchy.chapter || '').trim(),
      section: String(blockHierarchy.section || '').trim(),
      topic: String(blockHierarchy.topic || '').trim(),
      question: question || 'Refer to attached image.',
      questionImageUrl,
      questionImageDataUrl,
      options: normalizedOptions,
      optionImageDataUrls: options.map((option) => option.imageDataUrl || ''),
      answer: normalizedAnswer,
      tip: explanationLines.join('\n').trim(),
      explanationImageDataUrl,
      difficulty,
    });
  });

  if (blocks.length > 15) {
    errors.push('Only the first 15 MCQs were kept from this import.');
  }
  if (skipped > 0) {
    errors.push(`Skipped ${skipped} unclear block(s) and continued parsing the rest.`);
  }

  return { parsed, errors };
}

function delayMs(duration: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, Math.max(0, duration));
  });
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log('Retrying API request...', retries);
      await delayMs(3000);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

function buildApiBaseCandidates() {
  const fromEnv = String(API_BASE || '').trim().replace(/\/+$/, '');
  const canonicalRailway = fromEnv.includes('-62d2.up.railway.app')
    ? fromEnv.replace('-62d2.up.railway.app', '.up.railway.app')
    : '';
  const runtimeOrigin = typeof window !== 'undefined'
    ? String(window.location.origin || '').trim().replace(/\/+$/, '')
    : '';

  return Array.from(new Set([
    fromEnv,
    canonicalRailway,
    API_FALLBACK_BASE,
    runtimeOrigin,
  ].filter(Boolean)));
}

function toApiPrefix(apiBase: string) {
  const normalized = String(apiBase || '').trim().replace(/\/+$/, '');
  return normalized ? `${normalized}/api` : '/api';
}

async function runBackendPreflightCheck(options?: {
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
}): Promise<{ healthUrl: string; apiPrefix: string }> {
  const timeoutMs = Math.max(1_000, Number(options?.timeoutMs || BULK_ANALYZE_PREFLIGHT_TIMEOUT_MS));
  const attempts = Math.max(1, Math.floor(Number(options?.attempts || 1)));
  const retryDelayMs = Math.max(250, Number(options?.retryDelayMs || 1_000));
  const apiPrefixes = buildApiBaseCandidates().map((base) => toApiPrefix(base));
  const healthCandidates = Array.from(new Set([
    ...apiPrefixes.map((prefix) => `${prefix}/health`),
    String(AI_GENERATE_HEALTH_ENDPOINT || '').trim(),
  ].filter(Boolean)));
  const healthUrl = healthCandidates[0] || `${API_PREFIX}/health`;
  let lastError: unknown = null;

  // Give Railway a short moment to wake before health probing.
  await delayMs(1500);

  const isHealthyJsonPayload = (response: Response, payload: unknown) => {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return false;
    }

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const status = String((payload as { status?: unknown }).status || '').toLowerCase();
    return status === 'ok';
  };

  const canParseJsonResponse = async (response: Response) => {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return false;
    }

    try {
      const payload = await response.clone().json();
      return Boolean(payload) && typeof payload === 'object';
    } catch {
      return false;
    }
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const candidateUrl of healthCandidates) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        console.log('Calling API:', candidateUrl);
        const response = await fetchWithRetry(candidateUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
          signal: controller.signal,
        }, 3);

        let payload: unknown = null;
        try {
          payload = await response.clone().json();
        } catch {
          // Non-JSON responses (usually HTML fallback pages) should be ignored.
          payload = null;
        }

        if (!isHealthyJsonPayload(response, payload)) {
          throw new Error(`Non-JSON or invalid health payload from ${candidateUrl}`);
        }

        const resolvedPrefix = candidateUrl.replace(/\/health\/?$/i, '');

        const probeResponse = await fetchWithRetry(`${resolvedPrefix}/test`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
          },
          signal: controller.signal,
        }, 2);

        const isJsonProbe = await canParseJsonResponse(probeResponse);
        if (!isJsonProbe) {
          throw new Error(`API probe failed for ${resolvedPrefix}/test`);
        }

        return { healthUrl: candidateUrl, apiPrefix: resolvedPrefix };
      } catch (error) {
        lastError = error;
      } finally {
        window.clearTimeout(timeout);
      }
    }

    if (attempt < attempts) {
      await delayMs(retryDelayMs * attempt);
    }
  }

  const detail = lastError instanceof Error ? ` ${lastError.message}` : '';
  throw new Error(`Backend offline on ${healthUrl}. Start the backend API server or fix VITE_API_URL/VITE_DEV_API_ORIGIN.${detail}`);
}

function parseBulkMcqsAsync(raw: string): Promise<{ parsed: ParsedBulkMcq[]; errors: string[] }> {
  return new Promise((resolve) => {
    const execute = () => resolve(parseBulkMcqs(raw));
    const runtime = globalThis as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
    if (typeof runtime.requestIdleCallback === 'function') {
      runtime.requestIdleCallback(() => execute(), { timeout: 250 });
      return;
    }
    globalThis.setTimeout(execute, 0);
  });
}

function hasValidParsedMcqs(items: ParsedBulkMcq[]): boolean {
  return items.some((item) => {
    const question = String(item.question || '').trim();
    const questionImage = String(item.questionImageDataUrl || item.questionImageUrl || '').trim();
    const options = Array.isArray(item.options)
      ? item.options.map((option) => String(option || '').trim()).filter(Boolean)
      : [];
    const answer = String(item.answer || '').trim();
    return (Boolean(question || questionImage) && options.length >= 2 && Boolean(answer));
  });
}

function hierarchyLabel(selection: SelectedHierarchy | null): string {
  if (!selection) return 'No target selected';
  if (selection.kind === 'section') {
    return selection.part
      ? `${selection.subject} / ${selection.part} / ${selection.chapterTitle} / ${selection.sectionTitle}`
      : `${selection.subject} / ${selection.chapterTitle} / ${selection.sectionTitle}`;
  }
  return `${selection.subject} / ${selection.sectionTitle}`;
}

function resolveAnswerLabel(options: string[], answer: string): string {
  const normalized = String(answer || '').trim().toLowerCase();
  const answerIndex = options.findIndex((option) => String(option || '').trim().toLowerCase() === normalized);
  if (answerIndex >= 0) return String.fromCharCode(65 + answerIndex);

  const directLetter = String(answer || '').trim().match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (directLetter) return directLetter[1].toUpperCase();

  return String(answer || '').trim();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

const MCQ_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']);
const MCQ_IMAGE_NAME_PATTERN = /\.(jpe?g|png|webp|svg|gif)$/i;
const MCQ_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const GESTURE_EDITOR_MIN_ZOOM = 1;
const GESTURE_EDITOR_MAX_ZOOM = 6;
const GESTURE_EDITOR_MIN_CROP_EDGE = 72;

function isSupportedMcqImage(file: File) {
  const mime = String(file.type || '').toLowerCase();
  return MCQ_IMAGE_MIME_TYPES.has(mime) || MCQ_IMAGE_NAME_PATTERN.test(file.name || '');
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeEditorCrop(crop: GestureCropRect, viewportWidth: number, viewportHeight: number): GestureCropRect {
  const maxWidth = Math.max(GESTURE_EDITOR_MIN_CROP_EDGE, viewportWidth);
  const maxHeight = Math.max(GESTURE_EDITOR_MIN_CROP_EDGE, viewportHeight);
  const width = clampNumber(crop.width, GESTURE_EDITOR_MIN_CROP_EDGE, maxWidth);
  const height = clampNumber(crop.height, GESTURE_EDITOR_MIN_CROP_EDGE, maxHeight);
  const x = clampNumber(crop.x, 0, Math.max(0, viewportWidth - width));
  const y = clampNumber(crop.y, 0, Math.max(0, viewportHeight - height));
  return { x, y, width, height };
}

function createInitialGestureCrop(viewportWidth: number, viewportHeight: number): GestureCropRect {
  const width = Math.max(GESTURE_EDITOR_MIN_CROP_EDGE, Math.round(viewportWidth * 0.82));
  const height = Math.max(GESTURE_EDITOR_MIN_CROP_EDGE, Math.round(viewportHeight * 0.6));
  return normalizeEditorCrop({
    x: Math.round((viewportWidth - width) / 2),
    y: Math.round((viewportHeight - height) / 2),
    width,
    height,
  }, viewportWidth, viewportHeight);
}

function getImageNaturalSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Math.max(1, image.naturalWidth || image.width || 1),
        height: Math.max(1, image.naturalHeight || image.height || 1),
      });
    };
    image.onerror = () => reject(new Error('Could not load image dimensions.'));
    image.src = dataUrl;
  });
}

async function renderGestureCropToDataUrl(editor: GestureImageEditorState): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not decode image for crop.'));
    image.src = editor.sourceDataUrl;
  });

  const fitScale = Math.min(
    editor.viewportWidth / editor.naturalWidth,
    editor.viewportHeight / editor.naturalHeight,
  );
  const transformScale = fitScale * editor.zoom;
  const safeCrop = normalizeEditorCrop(editor.crop, editor.viewportWidth, editor.viewportHeight);
  const exportScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(safeCrop.width * exportScale));
  canvas.height = Math.max(1, Math.round(safeCrop.height * exportScale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create crop context.');
  }

  context.scale(exportScale, exportScale);
  context.translate(-safeCrop.x, -safeCrop.y);
  context.translate(editor.viewportWidth / 2 + editor.translateX, editor.viewportHeight / 2 + editor.translateY);
  context.rotate(editor.rotation);
  context.scale(transformScale, transformScale);
  context.filter = 'brightness(1.01) contrast(1.01)';
  context.drawImage(
    image,
    -editor.naturalWidth / 2,
    -editor.naturalHeight / 2,
    editor.naturalWidth,
    editor.naturalHeight,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

async function fileToMcqImage(file: File): Promise<AdminMcqImageFile> {
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

function parsedDataUrlToImage(dataUrl: string | undefined, fallbackName: string): AdminMcqImageFile | null {
  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!MCQ_IMAGE_MIME_TYPES.has(mimeType)) return null;

  const base64 = match[2].replace(/\s+/g, '');
  const size = Math.ceil((base64.length * 3) / 4);
  if (!size || size > MCQ_IMAGE_MAX_BYTES) return null;

  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
  };

  return {
    name: `${fallbackName}.${extensionByMime[mimeType] || 'img'}`,
    mimeType,
    size,
    dataUrl: normalized,
  };
}

function resolveAnswerKeyFromInput(options: AdminMcqOptionMedia[], answerInput: string): string {
  const normalized = String(answerInput || '').trim().toLowerCase();
  if (!normalized) return '';

  const direct = normalized.match(/^(?:option\s*)?([a-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (direct) {
    const token = direct[1];
    const idx = /^\d+$/.test(token)
      ? Number(token) - 1
      : token.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return String(options[idx].key || '').toUpperCase();
    }
  }

  const byText = options.find((item) => String(item.text || '').trim().toLowerCase() === normalized);
  if (byText) return String(byText.key || '').toUpperCase();

  const byKey = options.find((item) => String(item.key || '').trim().toLowerCase() === normalized);
  return byKey ? String(byKey.key || '').toUpperCase() : '';
}

function createEditableBankMcq(item: AdminMCQ): EditableBankMcq {
  const optionMedia = Array.isArray(item.optionMedia) && item.optionMedia.length
    ? item.optionMedia.map((option, index) => ({
      key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
      text: String(option.text || ''),
      image: option.image || null,
    }))
    : [
      { key: 'A', text: String(item.options?.[0] || ''), image: null },
      { key: 'B', text: String(item.options?.[1] || ''), image: null },
      { key: 'C', text: String(item.options?.[2] || ''), image: null },
      { key: 'D', text: String(item.options?.[3] || ''), image: null },
    ];

  const normalizedOptions = optionMedia.map((option, index) => ({
    key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
    text: String(option.text || ''),
    image: option.image || null,
  }));

  const resolvedDifficulty = String(item.difficulty || 'Medium').trim();
  const difficulty: 'Easy' | 'Medium' | 'Hard' = resolvedDifficulty === 'Easy' || resolvedDifficulty === 'Hard'
    ? resolvedDifficulty
    : 'Medium';

  return {
    id: item.id,
    subject: String(item.subject || '').trim().toLowerCase(),
    part: String(item.part || '').trim().toLowerCase(),
    chapter: String(item.chapter || '').trim(),
    section: String(item.section || '').trim(),
    topic: String(item.topic || '').trim(),
    questionType: item.questionImage ? 'image' : 'text',
    question: String(item.question || ''),
    questionImage: item.questionImage || null,
    optionMedia: normalizedOptions,
    optionTypes: normalizedOptions.map((option) => (option.image ? 'image' : 'text')),
    answer: String(item.answerKey || item.answer || ''),
    difficulty,
    explanationText: String(item.explanationText || item.tip || ''),
    explanationImage: item.explanationImage || null,
    shortTrickText: String(item.shortTrickText || ''),
    shortTrickImage: item.shortTrickImage || null,
  };
}

const PRACTICE_FILE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const PRACTICE_FILE_NAME_PATTERN = /\.(jpe?g|png|pdf|doc|docx)$/i;
const PRACTICE_FILE_MAX_BYTES = 8 * 1024 * 1024;

function isSupportedPracticeFile(file: File) {
  const mime = String(file.type || '').toLowerCase();
  return PRACTICE_FILE_MIME_TYPES.has(mime) || PRACTICE_FILE_NAME_PATTERN.test(file.name || '');
}

function generateTemporaryPassword(length = 12) {
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const allChars = `${lowers}${uppers}${digits}${symbols}`;

  const randomIndex = (max: number) => {
    if (max <= 0) return 0;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
  };

  const required = [
    lowers[randomIndex(lowers.length)],
    uppers[randomIndex(uppers.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)],
  ];

  const result = [...required];
  while (result.length < Math.max(8, length)) {
    result.push(allChars[randomIndex(allChars.length)]);
  }

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result.join('');
}

export default function AdminApp() {
  const activeView = new URLSearchParams(window.location.search).get('view');
  const isQuestionBankView = activeView === 'question-bank';
  const isPracticeBoardBankView = activeView === 'practice-board-bank';
  const initialSection = getSectionFromPath(window.location.pathname);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && isTabletSidebarViewport(window.innerWidth)) {
      return false;
    }
    return readStoredAdminSidebarPreference() ?? true;
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialThemeMode);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [adminLoadError, setAdminLoadError] = useState('');
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [isRefreshingSystemStatus, setIsRefreshingSystemStatus] = useState(false);
  const [configVariables, setConfigVariables] = useState<AdminConfigVariable[]>([]);
  const [isRefreshingConfigVariables, setIsRefreshingConfigVariables] = useState(false);
  const [isSavingConfigVariable, setIsSavingConfigVariable] = useState(false);
  const [isDeletingConfigVariable, setIsDeletingConfigVariable] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({
    key: '',
    value: '',
    description: '',
    isSecret: true,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [createUserForm, setCreateUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    password: '',
    activatePlan: false,
    planId: 'basic_monthly',
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
  const [mcqStructure, setMcqStructure] = useState<AdminMcqBankStructureItem[]>([]);
  const [bankSubjectKey, setBankSubjectKey] = useState('');
  const [bankChapterKey, setBankChapterKey] = useState('');
  const [bankSectionKey, setBankSectionKey] = useState('');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<'' | 'Easy' | 'Medium' | 'Hard'>('');
  const [bankMcqs, setBankMcqs] = useState<AdminMCQ[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [gestureImageEditor, setGestureImageEditor] = useState<GestureImageEditorState>({
    isOpen: false,
    sourceDataUrl: '',
    fileName: '',
    target: null,
    naturalWidth: 1,
    naturalHeight: 1,
    viewportWidth: 1,
    viewportHeight: 1,
    zoom: 1,
    rotation: 0,
    translateX: 0,
    translateY: 0,
    crop: { x: 0, y: 0, width: GESTURE_EDITOR_MIN_CROP_EDGE, height: GESTURE_EDITOR_MIN_CROP_EDGE },
  });
  const [isApplyingGestureCrop, setIsApplyingGestureCrop] = useState(false);
  const [selectedHierarchy, setSelectedHierarchy] = useState<SelectedHierarchy | null>(null);
  const [activeMcqPanel, setActiveMcqPanel] = useState<'upload' | 'deleter' | 'bank' | null>(null);
  const [uploadMode, setUploadMode] = useState<'manual' | 'document' | 'ai-generated'>('manual');
  const [aiGenSubject, setAiGenSubject] = useState('mathematics');
  const [aiGenPart, setAiGenPart] = useState('');
  const [aiGenChapter, setAiGenChapter] = useState('');
  const [aiGenSection, setAiGenSection] = useState('');
  const [aiGenTopic, setAiGenTopic] = useState('');
  const [aiGenChapterKey, setAiGenChapterKey] = useState('');
  const [aiGenInstructions, setAiGenInstructions] = useState('');
  const [aiGenDifficulty, setAiGenDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [aiGenSourceText, setAiGenSourceText] = useState('');
  const [aiGenFile, setAiGenFile] = useState<File | null>(null);
  const [aiGenGenerated, setAiGenGenerated] = useState<AiGeneratedMcqPayload | null>(null);
  const [aiGenGenerateErrors, setAiGenGenerateErrors] = useState<string[]>([]);
  const [aiPromptTemplateMeta, setAiPromptTemplateMeta] = useState<{ fileName: string; status: 'idle' | 'loading' | 'loaded' | 'error'; message: string }>({
    fileName: '',
    status: 'idle',
    message: '',
  });
  const [aiGenGenerating, setAiGenGenerating] = useState(false);
  const [aiGenUploading, setAiGenUploading] = useState(false);
  const aiGenGenerateInFlightRef = useRef(false);
  const aiGenUploadInFlightRef = useRef(false);
  const [subscriptionOverview, setSubscriptionOverview] = useState<AdminSubscriptionOverview | null>(null);
  const [subscriptionUsers, setSubscriptionUsers] = useState<AdminSubscriptionUser[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [assignPlanForm, setAssignPlanForm] = useState({
    email: '',
    planId: 'basic_monthly',
    status: 'active',
  });
  const [isAssigningPlan, setIsAssigningPlan] = useState(false);
  const [isAssignPlanConfirmOpen, setIsAssignPlanConfirmOpen] = useState(false);
  const [premiumRequests, setPremiumRequests] = useState<PremiumSubscriptionRequest[]>([]);
  const [premiumRequestStatusFilter, setPremiumRequestStatusFilter] = useState('all');
  const [premiumRequestQuery, setPremiumRequestQuery] = useState('');
  const [issuedPremiumTokens, setIssuedPremiumTokens] = useState<Record<string, string>>({});
  const [passwordRecoveryRequests, setPasswordRecoveryRequests] = useState<PasswordRecoveryRequest[]>([]);
  const [passwordRecoveryStatusFilter, setPasswordRecoveryStatusFilter] = useState('all');
  const [passwordRecoveryQuery, setPasswordRecoveryQuery] = useState('');
  const [securityInfoRows, setSecurityInfoRows] = useState<AdminSecurityInfoRow[]>([]);
  const [securityInfoPage, setSecurityInfoPage] = useState(1);
  const [securityInfoPageSize] = useState(20);
  const [securityInfoTotal, setSecurityInfoTotal] = useState(0);
  const [securityInfoTotalPages, setSecurityInfoTotalPages] = useState(1);
  const [securityInfoSearchInput, setSecurityInfoSearchInput] = useState('');
  const [securityInfoSearchApplied, setSecurityInfoSearchApplied] = useState('');
  const [securityInfoLoading, setSecurityInfoLoading] = useState(false);
  const [securityInfoReveal, setSecurityInfoReveal] = useState<Record<string, boolean>>({});
  const [practiceQuestions, setPracticeQuestions] = useState<AdminPracticeBoardQuestion[]>([]);
  const [practiceQuery, setPracticeQuery] = useState('');
  const [practiceBankSubjectKey, setPracticeBankSubjectKey] = useState('');
  const [practiceForm, setPracticeForm] = useState(emptyPracticeForm());
  const [isPracticeEditorOpen, setIsPracticeEditorOpen] = useState(false);
  const [practiceQuestionUpload, setPracticeQuestionUpload] = useState<File | null>(null);
  const [practiceSolutionUpload, setPracticeSolutionUpload] = useState<File | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [singleMcqInput, setSingleMcqInput] = useState('');
  const [pasteMcqCorrectAnswerImage, setPasteMcqCorrectAnswerImage] = useState<AdminMcqImageFile | null>(null);
  const [bulkParsed, setBulkParsed] = useState<ParsedBulkMcq[]>([]);
  const [showParsedPreview, setShowParsedPreview] = useState(false);
  const [bulkParseErrors, setBulkParseErrors] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProcessingLabel, setBulkProcessingLabel] = useState('Analysing MCQs...');
  const [bulkAnalysisReady, setBulkAnalysisReady] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkApplyDifficultyLevel, setBulkApplyDifficultyLevel] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const bulkAnalyzeInFlightRef = useRef(false);
  const bulkAnalyzeLastClickRef = useRef(0);
  const bulkAnalyzeRunIdRef = useRef(0);
  const [isSavingMcq, setIsSavingMcq] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState<BulkDeleteMode>('section-topic');
  const [bulkDeleteSubject, setBulkDeleteSubject] = useState('mathematics');
  const [bulkDeletePart, setBulkDeletePart] = useState('');
  const [bulkDeleteChapter, setBulkDeleteChapter] = useState('');
  const [bulkDeleteChapterKey, setBulkDeleteChapterKey] = useState('');
  const [bulkDeleteSectionOrTopic, setBulkDeleteSectionOrTopic] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [uploadChapterKey, setUploadChapterKey] = useState('');
  const [bankFilterSubject, setBankFilterSubject] = useState('');
  const [bankFilterPart, setBankFilterPart] = useState('');
  const [bankFilterChapterKey, setBankFilterChapterKey] = useState('');
  const [bankFilterSection, setBankFilterSection] = useState('');
  const [bankEditDrafts, setBankEditDrafts] = useState<Record<string, EditableBankMcq>>({});
  const [bankSavingIds, setBankSavingIds] = useState<Record<string, boolean>>({});
  const [questionSubmissions, setQuestionSubmissions] = useState<AdminQuestionSubmission[]>([]);
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('all');
  const [submissionSubjectFilter, setSubmissionSubjectFilter] = useState('all');
  const [submissionQuery, setSubmissionQuery] = useState('');
  const [submissionReviewNotes, setSubmissionReviewNotes] = useState<Record<string, string>>({});
  const [collapsedReviewedSubmissionIds, setCollapsedReviewedSubmissionIds] = useState<Record<string, boolean>>({});
  const [communityReports, setCommunityReports] = useState<AdminCommunityReport[]>([]);
  const [communityReportNotes, setCommunityReportNotes] = useState<Record<string, string>>({});
  const [supportConversations, setSupportConversations] = useState<AdminSupportConversation[]>([]);
  const [selectedSupportUserId, setSelectedSupportUserId] = useState('');
  const [activeSupportUser, setActiveSupportUser] = useState<AdminSupportThreadPayload['user'] | null>(null);
  const [supportMessages, setSupportMessages] = useState<AdminSupportMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState('');
  const [supportReplyAttachment, setSupportReplyAttachment] = useState<AdminSupportMessage['attachment']>(null);
  const [supportConversationQuery, setSupportConversationQuery] = useState('');
  const [adminDesktopAlertsEnabled, setAdminDesktopAlertsEnabled] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SUPPORT_DESKTOP_ALERTS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isSupportThreadLoading, setIsSupportThreadLoading] = useState(false);
  const [isSendingSupportReply, setIsSendingSupportReply] = useState(false);
  const supportReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const bulkDocumentInputRef = useRef<HTMLInputElement | null>(null);
  const explanationImageInputRef = useRef<HTMLInputElement | null>(null);
  const gestureSurfaceRef = useRef<HTMLDivElement | null>(null);
  const cropDragStateRef = useRef<{
    handle: GestureCropHandle;
    startX: number;
    startY: number;
    startCrop: GestureCropRect;
  } | null>(null);
  const pointerMapRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const imageGestureRef = useRef<
    | {
      mode: 'pan';
      pointerId: number;
      startX: number;
      startY: number;
      startTranslateX: number;
      startTranslateY: number;
    }
    | {
      mode: 'pinch';
      pointerA: number;
      pointerB: number;
      startDistance: number;
      startAngle: number;
      startMidX: number;
      startMidY: number;
      startZoom: number;
      startRotation: number;
      startTranslateX: number;
      startTranslateY: number;
    }
    | null
  >(null);
  const didHydrateSupportRef = useRef(false);
  const lastUnreadTotalRef = useRef(0);
  const lastUserMessageInThreadRef = useRef('');
  const [contributionPolicy, setContributionPolicy] = useState<AdminContributionPolicy>({
    maxSubmissionsPerDay: 5,
    maxFilesPerSubmission: 3,
    maxFileSizeBytes: 1024 * 1024,
    blockDurationMinutes: 180,
  });

  const filteredMcqs = useMemo(() => {
    if (!query.trim()) return mcqs;
    const needle = query.toLowerCase();
    return mcqs.filter((item) =>
      [item.subject, item.part, item.chapter, item.section, item.topic, item.question, item.difficulty]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [mcqs, query]);

  const filteredBankMcqs = useMemo(() => {
    if (!bankDifficultyFilter) return bankMcqs;
    const target = String(bankDifficultyFilter || '').trim().toLowerCase();
    return bankMcqs.filter((item) => String(item.difficulty || '').trim().toLowerCase() === target);
  }, [bankMcqs, bankDifficultyFilter]);

  const selectedDirectAssignPlanName = useMemo(() => {
    const matched = (subscriptionOverview?.plans || []).find((item) => item.id === assignPlanForm.planId);
    return matched?.name || assignPlanForm.planId || 'Unknown plan';
  }, [subscriptionOverview, assignPlanForm.planId]);

  const filteredPracticeQuestions = useMemo(() => {
    if (!practiceQuery.trim()) return practiceQuestions;
    const needle = practiceQuery.toLowerCase();
    return practiceQuestions.filter((item) =>
      [
        item.subject,
        item.difficulty,
        item.questionText,
        item.solutionText,
        item.questionFile?.name || '',
        item.solutionFile?.name || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [practiceQuestions, practiceQuery]);

  const practiceQuestionsBySubject = useMemo(() => {
    const grouped = new Map<string, AdminPracticeBoardQuestion[]>();
    practiceQuestions.forEach((item) => {
      const key = String(item.subject || 'general').trim().toLowerCase() || 'general';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([subject, questions]) => ({
        subject,
        questions: questions.sort((a, b) => {
          const aq = String(a.questionText || '').toLowerCase();
          const bq = String(b.questionText || '').toLowerCase();
          return aq.localeCompare(bq);
        }),
      }));
  }, [practiceQuestions]);

  const activePracticeBankSubject = useMemo(() => {
    if (!practiceQuestionsBySubject.length) return null;
    return practiceQuestionsBySubject.find((item) => item.subject === practiceBankSubjectKey) || practiceQuestionsBySubject[0];
  }, [practiceQuestionsBySubject, practiceBankSubjectKey]);

  useEffect(() => {
    const syncSection = () => {
      const nextSection = getSectionFromPath(window.location.pathname);
      setActiveSection(nextSection);

      if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
        setIsMobileSidebarOpen(false);
      }

      if (isTabletSidebarViewport(window.innerWidth)) {
        setIsSidebarExpanded(false);
      }
    };

    window.addEventListener('popstate', syncSection);
    return () => {
      window.removeEventListener('popstate', syncSection);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
      setIsMobileSidebarOpen(false);
    }

    if (isTabletSidebarViewport(window.innerWidth)) {
      setIsSidebarExpanded(false);
    }
  }, [activeSection]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;

      if (width < ADMIN_DESKTOP_MIN_WIDTH) {
        setIsMobileSidebarOpen(false);
      }

      if (isTabletSidebarViewport(width)) {
        setIsSidebarExpanded(false);
        return;
      }

      if (width >= ADMIN_TABLET_COLLAPSE_MAX_WIDTH) {
        setIsSidebarExpanded(readStoredAdminSidebarPreference() ?? true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', themeMode === 'dark');
    root.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const practiceBankVisibleQuestions = useMemo(() => {
    const source = activePracticeBankSubject?.questions || [];
    if (!practiceQuery.trim()) return source;
    const needle = practiceQuery.toLowerCase();
    return source.filter((item) => {
      const blob = [
        item.questionText,
        item.solutionText,
        item.difficulty,
        item.questionFile?.name || '',
        item.solutionFile?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [activePracticeBankSubject, practiceQuery]);

  const filteredQuestionSubmissions = useMemo(() => {
    const needle = submissionQuery.trim().toLowerCase();

    return questionSubmissions.filter((item) => {
      if (submissionStatusFilter !== 'all' && item.status !== submissionStatusFilter) return false;
      if (submissionSubjectFilter !== 'all' && item.subject.toLowerCase() !== submissionSubjectFilter.toLowerCase()) return false;
      if (!needle) return true;

      const blob = [
        item.subject,
        item.questionText,
        item.questionDescription,
        item.questionSource,
        item.submissionReason,
        item.submittedByName,
        item.submittedByEmail,
        item.reviewNotes,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [questionSubmissions, submissionStatusFilter, submissionSubjectFilter, submissionQuery]);

  const filteredSupportConversations = useMemo(() => {
    const needle = supportConversationQuery.trim().toLowerCase();
    if (!needle) return supportConversations;
    return supportConversations.filter((item) => {
      const blob = [item.userName, item.email, item.mobileNumber, item.lastMessageText].join(' ').toLowerCase();
      return blob.includes(needle);
    });
  }, [supportConversations, supportConversationQuery]);

  const submissionSubjects = useMemo(() => {
    return Array.from(new Set(questionSubmissions.map((item) => item.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [questionSubmissions]);

  const pendingSignupRequests = useMemo(() => {
    return signupRequests.filter((item) => item.status === 'pending');
  }, [signupRequests]);

  const completedSignupRequests = useMemo(() => {
    return signupRequests.filter((item) => item.status === 'approved' || item.status === 'completed');
  }, [signupRequests]);

  const bankTree = useMemo(() => {
    const subjectMap = new Map<string, {
      key: string;
      label: string;
      count: number;
      chapters: Map<string, {
        key: string;
        label: string;
        count: number;
        sections: Map<string, { key: string; label: string; count: number }>;
      }>;
    }>();

    mcqStructure.forEach((row) => {
      const subjectKey = String(row.subject || '').trim().toLowerCase();
      if (!subjectKey) return;
      const chapterRaw = String(row.chapter || '').trim();
      const sectionRaw = String(row.section || '').trim();
      const count = Number(row.count || 0);

      const chapterKey = chapterRaw ? normalizeHierarchyLabel(chapterRaw) : '__no_chapter__';
      const chapterLabel = chapterRaw || 'General Topics';
      const sectionLabel = sectionRaw || chapterLabel;
      const sectionKey = normalizeHierarchyLabel(sectionLabel);

      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, {
          key: subjectKey,
          label: subjectKey,
          count: 0,
          chapters: new Map(),
        });
      }

      const subjectNode = subjectMap.get(subjectKey)!;
      subjectNode.count += count;

      if (!subjectNode.chapters.has(chapterKey)) {
        subjectNode.chapters.set(chapterKey, {
          key: chapterKey,
          label: chapterLabel,
          count: 0,
          sections: new Map(),
        });
      }

      const chapterNode = subjectNode.chapters.get(chapterKey)!;
      chapterNode.count += count;

      if (!chapterNode.sections.has(sectionKey)) {
        chapterNode.sections.set(sectionKey, {
          key: sectionKey,
          label: sectionLabel,
          count: 0,
        });
      }
      chapterNode.sections.get(sectionKey)!.count += count;
    });

    return Array.from(subjectMap.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((subject) => ({
        ...subject,
        chapters: Array.from(subject.chapters.values())
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((chapter) => ({
            ...chapter,
            sections: Array.from(chapter.sections.values()).sort((a, b) => a.label.localeCompare(b.label)),
          })),
      }));
  }, [mcqStructure]);

  const activeBankSubject = useMemo(() => bankTree.find((item) => item.key === bankSubjectKey) || null, [bankTree, bankSubjectKey]);
  const activeBankChapter = useMemo(() => activeBankSubject?.chapters.find((item) => item.key === bankChapterKey) || null, [activeBankSubject, bankChapterKey]);
  const activeBankSection = useMemo(() => activeBankChapter?.sections.find((item) => item.key === bankSectionKey) || null, [activeBankChapter, bankSectionKey]);

  const syllabusTree = useMemo(() => {
    type ChapterNode = {
      key: string;
      title: string;
      part: 'part1' | 'part2' | '';
      sections: string[];
    };

    const subjectMap = new Map<string, { subject: string; label: string; chapters: Map<string, ChapterNode> }>();
    const dbSubjectSet = new Set<string>();

    const ensureSubject = (subjectKey: string, explicitLabel?: string) => {
      const normalized = String(subjectKey || '').trim().toLowerCase();
      if (!normalized) return null;
      if (!subjectMap.has(normalized)) {
        subjectMap.set(normalized, {
          subject: normalized,
          label: explicitLabel || toTitleLabel(normalized),
          chapters: new Map<string, ChapterNode>(),
        });
      }
      return subjectMap.get(normalized)!;
    };

    const ensureChapter = (
      subjectNode: { subject: string; label: string; chapters: Map<string, ChapterNode> },
      title: string,
      part: 'part1' | 'part2' | '',
      sections: string[],
    ) => {
      const chapterTitle = String(title || '').trim() || 'General Topics';
      const key = `${part || 'none'}::${normalizeSyllabusChapterKey(chapterTitle)}`;
      if (!subjectNode.chapters.has(key)) {
        subjectNode.chapters.set(key, {
          key,
          title: chapterTitle,
          part,
          sections: [],
        });
      }
      const chapter = subjectNode.chapters.get(key)!;
      chapter.sections = dedupeNormalizedStrings([
        ...chapter.sections,
        ...sections.filter(Boolean),
      ]).sort((a, b) => a.localeCompare(b));
    };

    const specialLabels: Record<string, string> = {
      'quantitative-mathematics': 'Quantitative Mathematics',
      'design-aptitude': 'Design Aptitude',
      'computer-science': 'Computer Science',
      intelligence: 'Intelligence',
    };

    Object.entries(SYLLABUS).forEach(([subject, subjectParts]) => {
      const subjectNode = ensureSubject(subject, toTitleLabel(subject));
      if (!subjectNode) return;
      (['part1', 'part2'] as const).forEach((part) => {
        const partData = subjectParts?.[part];
        (partData?.chapters || []).forEach((chapter) => {
          ensureChapter(
            subjectNode,
            chapter.title,
            part,
            Array.isArray(chapter.sections) ? chapter.sections : [],
          );
        });
      });
    });

    const computerScienceNode = ensureSubject('computer-science', specialLabels['computer-science']);
    if (computerScienceNode) {
      COMPUTER_SCIENCE_SYLLABUS.forEach((chapter) => {
        ensureChapter(
          computerScienceNode,
          chapter.title,
          '',
          Array.isArray(chapter.sections) ? chapter.sections : [],
        );
      });
    }

    const intelligenceNode = ensureSubject('intelligence', specialLabels.intelligence);
    if (intelligenceNode) {
      INTELLIGENCE_SYLLABUS.forEach((chapter) => {
        ensureChapter(
          intelligenceNode,
          chapter.title,
          '',
          Array.isArray(chapter.sections) ? chapter.sections : [],
        );
      });
    }

    FLAT_TOPIC_SUBJECTS.forEach((subject) => {
      const subjectNode = ensureSubject(subject, specialLabels[subject] || toTitleLabel(subject));
      if (!subjectNode) return;

      const configuredFlatTopics = dedupeNormalizedStrings(
        (FLAT_TOPIC_TABS[subject as 'quantitative-mathematics' | 'design-aptitude']?.topics || []).filter(Boolean),
      );
      if (!configuredFlatTopics.length) return;

      ensureChapter(
        subjectNode,
        `${FLAT_TOPIC_TABS[subject as 'quantitative-mathematics' | 'design-aptitude']?.title || toTitleLabel(subject)} Topics`,
        '',
        configuredFlatTopics,
      );
    });

    mcqStructure.forEach((row) => {
      const subjectKey = String(row.subject || '').trim().toLowerCase();
      if (!subjectKey) return;
      dbSubjectSet.add(subjectKey);

      const subjectNode = ensureSubject(subjectKey, specialLabels[subjectKey] || toTitleLabel(subjectKey));
      if (!subjectNode) return;

      const partRaw = String(row.part || '').trim().toLowerCase();
      const chapterRaw = String(row.chapter || '').trim();
      const sectionRaw = String(row.section || '').trim();

      const part: 'part1' | 'part2' | '' = partRaw === 'part1' || partRaw === 'part2' ? partRaw : '';
      const chapterTitle = chapterRaw || 'General Topics';
      const sectionFallback = chapterTitle;

      ensureChapter(subjectNode, chapterTitle, part, [sectionRaw || sectionFallback]);
    });

    return Array.from(subjectMap.values())
      .map((subject) => ({
        subject: subject.subject,
        label: subject.label,
        fromDatabase: dbSubjectSet.has(subject.subject),
        chapters: Array.from(subject.chapters.values()).sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [mcqStructure]);

  const manualSubjectOptions = useMemo(
    () => syllabusTree.map((item) => ({ value: item.subject, label: item.label })),
    [syllabusTree],
  );

  const aiPromptSubjectOptions = useMemo(
    () => manualSubjectOptions.filter((item) => String(item.value || '').trim().length > 0),
    [manualSubjectOptions],
  );

  const isManualFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizeSubjectKey(form.subject));
  const isAiGenFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizeSubjectKey(aiGenSubject));
  const isBulkDeleteFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizeSubjectKey(bulkDeleteSubject));
  const isBankFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizeSubjectKey(bankFilterSubject));
  const isManualPartSelectionSubject = !isManualFlatTopicSubject && isPartSelectionRequiredSubject(form.subject);
  const isAiGenPartSelectionSubject = !isAiGenFlatTopicSubject && isPartSelectionRequiredSubject(aiGenSubject);
  const isBulkDeletePartSelectionSubject = !isBulkDeleteFlatTopicSubject && isPartSelectionRequiredSubject(bulkDeleteSubject);
  const isBankPartSelectionSubject = !isBankFlatTopicSubject && isPartSelectionRequiredSubject(bankFilterSubject);

  const partOptions: Array<{ value: 'part1' | 'part2'; label: string }> = [
    { value: 'part1', label: 'Part 1' },
    { value: 'part2', label: 'Part 2' },
  ];

  const manualChapterOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === form.subject);
    return (activeSubject?.chapters || [])
      .filter((chapter) => (isManualPartSelectionSubject ? chapter.part === form.part : true))
      .map((chapter) => ({
      value: chapter.key,
      label: chapter.title,
      chapterTitle: chapter.title,
      part: chapter.part,
      }));
  }, [syllabusTree, form.subject, form.part, isManualPartSelectionSubject]);

  const aiGenChapterOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === aiGenSubject);
    return (activeSubject?.chapters || [])
      .filter((chapter) => (isAiGenPartSelectionSubject ? chapter.part === aiGenPart : true))
      .map((chapter) => ({
        value: chapter.key,
        label: chapter.title,
        chapterTitle: chapter.title,
        part: chapter.part,
      }));
  }, [syllabusTree, aiGenSubject, aiGenPart, isAiGenPartSelectionSubject]);

  const manualSectionOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === form.subject);
    if (isManualFlatTopicSubject) {
      return dedupeNormalizedStrings(
        (activeSubject?.chapters || []).flatMap((item) => item.sections || []).filter(Boolean),
      ).sort((a, b) => a.localeCompare(b));
    }

    const chapter = manualChapterOptions.find((item) => item.value === uploadChapterKey);
    if (!chapter) return [];
    const subjectChapter = (activeSubject?.chapters || []).find((item) => item.key === chapter.value);
    return dedupeNormalizedStrings((subjectChapter?.sections || []).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  }, [syllabusTree, form.subject, uploadChapterKey, manualChapterOptions, isManualFlatTopicSubject]);

  const aiGenSectionOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === aiGenSubject);
    if (isAiGenFlatTopicSubject) {
      return dedupeNormalizedStrings(
        (activeSubject?.chapters || []).flatMap((item) => item.sections || []).filter(Boolean),
      ).sort((a, b) => a.localeCompare(b));
    }

    const chapter = aiGenChapterOptions.find((item) => item.value === aiGenChapterKey);
    if (!chapter) return [];
    const subjectChapter = (activeSubject?.chapters || []).find((item) => item.key === chapter.value);
    return dedupeNormalizedStrings((subjectChapter?.sections || []).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  }, [syllabusTree, aiGenSubject, aiGenChapterKey, aiGenChapterOptions, isAiGenFlatTopicSubject]);

  useEffect(() => {
    if (!token || !aiGenSubject) {
      setAiPromptTemplateMeta({ fileName: '', status: 'idle', message: '' });
      return;
    }

    let cancelled = false;
    setAiPromptTemplateMeta({ fileName: '', status: 'loading', message: '' });

    void apiRequest<AiPromptTemplateMetaResponse>(`/api/admin/mcq-prompts/${encodeURIComponent(aiGenSubject)}`, {}, token)
      .then((payload) => {
        if (cancelled) return;
        if (payload?.ok === false || !payload?.promptFile) {
          setAiPromptTemplateMeta({
            fileName: '',
            status: 'error',
            message: String(payload?.error || 'Prompt template is not available for this subject.'),
          });
          return;
        }

        setAiPromptTemplateMeta({
          fileName: String(payload.promptFile || '').trim(),
          status: 'loaded',
          message: '',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setAiPromptTemplateMeta({
          fileName: '',
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load prompt template for this subject.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [token, aiGenSubject]);

  const deleteSubjectOptions = manualSubjectOptions;

  const deleteChapterOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === bulkDeleteSubject);
    return (activeSubject?.chapters || [])
      .filter((chapter) => (isBulkDeletePartSelectionSubject ? chapter.part === bulkDeletePart : true))
      .map((chapter) => ({
      value: chapter.key,
      label: chapter.title,
      chapterTitle: chapter.title,
      part: chapter.part,
      }));
  }, [syllabusTree, bulkDeleteSubject, bulkDeletePart, isBulkDeletePartSelectionSubject]);

  const deleteSectionOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === bulkDeleteSubject);
    if (isBulkDeleteFlatTopicSubject) {
      return dedupeNormalizedStrings(
        (activeSubject?.chapters || []).flatMap((item) => item.sections || []).filter(Boolean),
      ).sort((a, b) => a.localeCompare(b));
    }
    const chapter = (activeSubject?.chapters || []).find((item) => item.key === bulkDeleteChapterKey);
    return dedupeNormalizedStrings((chapter?.sections || []).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  }, [syllabusTree, bulkDeleteSubject, bulkDeleteChapterKey, isBulkDeleteFlatTopicSubject]);

  const bankSubjectOptions = manualSubjectOptions;

  const bankChapterOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === bankFilterSubject);
    return (activeSubject?.chapters || [])
      .filter((chapter) => (isBankPartSelectionSubject ? chapter.part === bankFilterPart : true))
      .map((chapter) => ({
      value: chapter.key,
      label: chapter.title,
      chapterTitle: chapter.title,
      part: chapter.part,
      }));
  }, [syllabusTree, bankFilterSubject, bankFilterPart, isBankPartSelectionSubject]);

  const bankSectionOptions = useMemo(() => {
    const activeSubject = syllabusTree.find((item) => item.subject === bankFilterSubject);
    if (isBankFlatTopicSubject) {
      return dedupeNormalizedStrings(
        (activeSubject?.chapters || []).flatMap((item) => item.sections || []).filter(Boolean),
      ).sort((a, b) => a.localeCompare(b));
    }
    const chapter = (activeSubject?.chapters || []).find((item) => item.key === bankFilterChapterKey);
    return dedupeNormalizedStrings((chapter?.sections || []).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  }, [syllabusTree, bankFilterSubject, bankFilterChapterKey, isBankFlatTopicSubject]);

  const authToken = token;

  const playNotificationTone = () => {
    try {
      const AudioCtx = (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 930;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch {
      // Ignore notification tone errors.
    }
  };

  const canUseDesktopNotifications = typeof window !== 'undefined' && 'Notification' in window;

  const setAdminDesktopAlertsPreference = (enabled: boolean) => {
    setAdminDesktopAlertsEnabled(enabled);
    try {
      sessionStorage.setItem(ADMIN_SUPPORT_DESKTOP_ALERTS_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  };

  const enableAdminDesktopAlerts = async () => {
    if (!canUseDesktopNotifications) {
      toast.error('Desktop notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'granted') {
      setAdminDesktopAlertsPreference(true);
      toast.success('Desktop alerts enabled for this tab.');
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error('Desktop notifications are blocked in browser settings.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setAdminDesktopAlertsPreference(true);
      toast.success('Desktop alerts enabled for this tab.');
    } else {
      toast.error('Notification permission was not granted.');
    }
  };

  const notifyAdminDesktop = (title: string, body: string) => {
    if (!adminDesktopAlertsEnabled || !canUseDesktopNotifications) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    try {
      const notification = new Notification(title, {
        body,
        tag: 'net360-support-admin',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Ignore notification delivery errors.
    }
  };

  const clearAdminSession = () => {
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (typeof window !== 'undefined' && String(window.location.pathname || '').toLowerCase() !== '/admin') {
      window.location.assign('/admin');
    }
  };

  const navigateToSection = (section: AdminSection, replace = false) => {
    const nextPath = ADMIN_SECTION_ROUTES[section] || ADMIN_SECTION_ROUTES.dashboard;
    const nextUrl = `${nextPath}${window.location.search || ''}${window.location.hash || ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;

    if (replace) {
      window.history.replaceState({}, '', nextUrl);
    } else if (currentUrl !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }

    setActiveSection(section);

    if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
      setIsMobileSidebarOpen(false);
    }

    if (isTabletSidebarViewport(window.innerWidth)) {
      setIsSidebarExpanded(false);
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth >= ADMIN_DESKTOP_MIN_WIDTH) {
      const nextExpanded = !isSidebarExpanded;
      setIsSidebarExpanded(nextExpanded);

      if (!isTabletSidebarViewport(window.innerWidth)) {
        try {
          localStorage.setItem(ADMIN_SIDEBAR_EXPANDED_KEY, nextExpanded ? '1' : '0');
        } catch {
          // Ignore persistence failures.
        }
      }
      return;
    }
    setIsMobileSidebarOpen((prev) => !prev);
  };

  useEffect(() => {
    const pathname = String(window.location.pathname || '').toLowerCase();
    if (pathname === '/admin' || pathname === '/admin/') {
      navigateToSection('dashboard', true);
    }
  }, []);

  const openQuestionBankWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'question-bank');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const openPracticeBoardBankWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'practice-board-bank');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const openPracticeFile = (file?: { dataUrl: string } | null) => {
    const dataUrl = String(file?.dataUrl || '').trim();
    if (!dataUrl) return;
    if (!openDataUrlPreview(dataUrl)) {
      toast.error('Could not open file preview.');
    }
  };

  const downloadPracticeFile = (file?: { dataUrl: string; name: string } | null) => {
    const dataUrl = String(file?.dataUrl || '').trim();
    const name = String(file?.name || 'practice-file');
    if (!dataUrl) return;

    if (!downloadDataUrlFile(dataUrl, name)) {
      toast.error('Could not download file.');
    }
  };

  const loadAdminData = async (activeToken: string) => {
    const [
      overviewPayload,
      usersPayload,
      requestPayload,
      mcqPayload,
      practicePayload,
      submissionPayload,
      policyPayload,
      subscriptionOverviewPayload,
      subscriptionUsersPayload,
      premiumRequestsPayload,
      passwordRecoveryPayload,
      communityReportsPayload,
      supportConversationsPayload,
      structurePayload,
      systemStatusPayload,
      configVariablesPayload,
    ] = await Promise.all([
      apiRequest<AdminOverview>('/api/admin/overview', {}, activeToken),
      apiRequest<{ users: AdminUser[] }>('/api/admin/users', {}, activeToken),
      apiRequest<{ requests: SignupRequest[] }>('/api/admin/signup-requests?status=all', {}, activeToken),
      apiRequest<{ mcqs: AdminMCQ[] }>('/api/admin/mcqs', {}, activeToken),
      apiRequest<{ questions: AdminPracticeBoardQuestion[] }>('/api/admin/practice-board/questions', {}, activeToken).catch(() => ({ questions: [] })),
      apiRequest<{ submissions: AdminQuestionSubmission[] }>('/api/admin/question-submissions?status=all', {}, activeToken).catch(() => ({ submissions: [] })),
      apiRequest<{ policy: AdminContributionPolicy }>('/api/admin/question-submissions/policy', {}, activeToken).catch(() => ({
        policy: {
          maxSubmissionsPerDay: 5,
          maxFilesPerSubmission: 3,
          maxFileSizeBytes: 1024 * 1024,
          blockDurationMinutes: 180,
        },
      })),
      apiRequest<AdminSubscriptionOverview>('/api/admin/subscriptions/overview', {}, activeToken).catch(() => ({
        totalUsers: 0,
        activeUsers: 0,
        expiredUsers: 0,
        plans: [],
        dailyUsage: [],
      })),
      apiRequest<{ users: AdminSubscriptionUser[] }>(`/api/admin/subscriptions/users?status=${subscriptionFilter}`, {}, activeToken).catch(() => ({ users: [] })),
      apiRequest<{ requests: PremiumSubscriptionRequest[] }>(
        `/api/admin/subscriptions/requests?status=${premiumRequestStatusFilter}&q=${encodeURIComponent(premiumRequestQuery.trim())}`,
        {},
        activeToken,
      ).catch(() => ({ requests: [] })),
      apiRequest<{ requests: PasswordRecoveryRequest[] }>(
        `/api/admin/password-recovery-requests?status=${passwordRecoveryStatusFilter}&q=${encodeURIComponent(passwordRecoveryQuery.trim())}`,
        {},
        activeToken,
      ).catch(() => ({ requests: [] })),
      apiRequest<{ reports: AdminCommunityReport[] }>('/api/admin/community/reports', {}, activeToken).catch(() => ({ reports: [] })),
      apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, activeToken).catch(() => ({ conversations: [] })),
      apiRequest<{ structure: AdminMcqBankStructureItem[] }>('/api/admin/mcq-bank/structure', {}, activeToken).catch(() => ({ structure: [] })),
      apiRequest<AdminSystemStatus>('/api/admin/system-status', {}, activeToken).catch(() => ({
        openai: {
          configured: false,
          model: 'unknown',
          keySource: 'missing',
        },
        serverTime: new Date().toISOString(),
      })),
      apiRequest<{ variables: AdminConfigVariable[] }>('/api/admin/configurations', {}, activeToken).catch(() => ({ variables: [] })),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setSignupRequests(requestPayload.requests || []);
    setMcqs((previous) => (selectedHierarchy ? previous : []));
    setPracticeQuestions(practicePayload.questions || []);
    setQuestionSubmissions(submissionPayload.submissions || []);
    setContributionPolicy(policyPayload.policy || {
      maxSubmissionsPerDay: 5,
      maxFilesPerSubmission: 3,
      maxFileSizeBytes: 1024 * 1024,
      blockDurationMinutes: 180,
    });
    setSubscriptionOverview(subscriptionOverviewPayload);
    setSubscriptionUsers(subscriptionUsersPayload.users || []);
    setPremiumRequests(premiumRequestsPayload.requests || []);
    setPasswordRecoveryRequests(passwordRecoveryPayload.requests || []);
    setCommunityReports(communityReportsPayload.reports || []);
    setSupportConversations(supportConversationsPayload.conversations || []);
    setMcqStructure(structurePayload.structure || []);
    setSystemStatus(systemStatusPayload);
    setConfigVariables(configVariablesPayload.variables || []);
  };

  const loadSecurityInfoPage = useCallback(async () => {
    if (!authToken) return;
    setSecurityInfoLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(securityInfoPage),
        limit: String(securityInfoPageSize),
        q: securityInfoSearchApplied.trim(),
      });
      const payload = await apiRequest<{
        items: AdminSecurityInfoRow[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>(`/api/admin/users/security-info?${params.toString()}`, {}, authToken);
      setSecurityInfoRows(payload.items || []);
      setSecurityInfoTotal(Number(payload.total) || 0);
      setSecurityInfoTotalPages(Math.max(1, Number(payload.totalPages) || 1));
      setSecurityInfoReveal({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load security info.');
    } finally {
      setSecurityInfoLoading(false);
    }
  }, [authToken, securityInfoPage, securityInfoPageSize, securityInfoSearchApplied]);

  const loadBankMcqs = async (
    activeToken: string,
    subject: string,
    chapterKey: string,
    chapterLabel: string,
    sectionLabel: string,
  ) => {
    const params = new URLSearchParams({ subject });
    if (chapterKey && chapterKey !== '__no_chapter__' && chapterLabel) {
      params.set('chapter', chapterLabel);
    }
    params.set('section', sectionLabel);

    setBankLoading(true);
    try {
      const payload = await apiRequest<{ mcqs: AdminMCQ[] }>(`/api/admin/mcqs?${params.toString()}`, {}, activeToken);
      setBankMcqs(payload.mcqs || []);
    } finally {
      setBankLoading(false);
    }
  };

  const refreshSystemStatus = async () => {
    if (!authToken) {
      toast.error('Login required to refresh system status.');
      return;
    }

    setIsRefreshingSystemStatus(true);
    try {
      const payload = await apiRequest<AdminSystemStatus>('/api/admin/system-status', {}, authToken);
      setSystemStatus(payload);
      toast.success('System status refreshed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh system status.');
    } finally {
      setIsRefreshingSystemStatus(false);
    }
  };

  const refreshConfigVariables = async () => {
    if (!authToken) {
      toast.error('Login required to refresh configuration list.');
      return;
    }

    setIsRefreshingConfigVariables(true);
    try {
      const payload = await apiRequest<{ variables: AdminConfigVariable[] }>('/api/admin/configurations', {}, authToken);
      setConfigVariables(payload.variables || []);
      toast.success('Configuration list refreshed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh configurations.');
    } finally {
      setIsRefreshingConfigVariables(false);
    }
  };

  const saveConfigVariable = async () => {
    if (!authToken) {
      toast.error('Login required to save configuration.');
      return;
    }

    const key = configForm.key.trim().toUpperCase();
    if (!key) {
      toast.error('Configuration key is required.');
      return;
    }
    if (!configForm.value.trim()) {
      toast.error('Configuration value is required.');
      return;
    }

    setIsSavingConfigVariable(true);
    try {
      await apiRequest<{ variable: AdminConfigVariable }>(
        `/api/admin/configurations/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            key,
            value: configForm.value,
            description: configForm.description,
            isSecret: configForm.isSecret,
          }),
        },
        authToken,
      );

      setConfigForm({ key: '', value: '', description: '', isSecret: true });
      await refreshConfigVariables();
      if (activeSection !== 'system-config') {
        await refreshSystemStatus();
      }
      toast.success('Configuration saved securely.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save configuration.');
    } finally {
      setIsSavingConfigVariable(false);
    }
  };

  const deleteConfigVariable = async (key: string) => {
    if (!authToken) {
      toast.error('Login required to delete configuration.');
      return;
    }

    const approved = window.confirm(`Delete configuration ${key}? This cannot be undone.`);
    if (!approved) return;

    setIsDeletingConfigVariable(key);
    try {
      await apiRequest(`/api/admin/configurations/${encodeURIComponent(key)}`, { method: 'DELETE' }, authToken);
      await refreshConfigVariables();
      if (activeSection !== 'system-config') {
        await refreshSystemStatus();
      }
      toast.success(`Deleted configuration ${key}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete configuration.');
    } finally {
      setIsDeletingConfigVariable(null);
    }
  };

  const loadSectionMcqs = async (
    activeToken: string,
    sectionPath: SelectedHierarchy,
  ) => {
    const params = new URLSearchParams({ subject: sectionPath.subject });
    if (sectionPath.kind === 'section') {
      if (isPartSelectionRequiredSubject(sectionPath.subject) && sectionPath.part) {
        params.set('part', sectionPath.part);
      }
      params.set('chapter', sectionPath.chapterTitle);
      params.set('section', sectionPath.sectionTitle);
    } else {
      params.set('topic', sectionPath.sectionTitle);
    }

    const payload = await apiRequest<{ mcqs: AdminMCQ[] }>(`/api/admin/mcqs?${params.toString()}`, {}, activeToken);
    setMcqs(payload.mcqs || []);
  };

  useEffect(() => {
    if (!authToken) {
      setReady(true);
      return;
    }
    const currentToken: string = authToken;
    const currentRefreshToken: string | null = refreshToken;

    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAdminData(currentToken);
        if (!cancelled) {
          setAdminLoadError('');
        }
      } catch (error) {
        if (!cancelled) {
          const status = Number((error as { status?: number } | null)?.status || 0);
          const message = error instanceof Error ? error.message : 'Could not load admin data.';
          console.error('Admin data load failed:', error);

          if (status === 401 || status === 403) {
            clearAdminSession();
          } else {
            setAdminLoadError(message);
            toast.error('Could not load admin data. Please try refreshing again.');
          }
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    authToken,
    refreshToken,
    subscriptionFilter,
    premiumRequestStatusFilter,
    premiumRequestQuery,
    passwordRecoveryStatusFilter,
    passwordRecoveryQuery,
  ]);

  useEffect(() => {
    if (!authToken || !ready || activeSection !== 'security-info') return;
    void loadSecurityInfoPage();
  }, [authToken, ready, activeSection, loadSecurityInfoPage]);

  useEffect(() => {
    if (!authToken || !ready) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;

    const closeCurrent = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (closed) return;
      closeCurrent();
      source = new EventSource(buildSseStreamUrl(authToken), { withCredentials: true });

      source.addEventListener('sync', () => {
        if (document.hidden) return;
        void loadAdminData(authToken)
          .then(() => setAdminLoadError(''))
          .catch((error) => {
            const message = error instanceof Error ? error.message : 'Could not refresh admin data.';
            console.error('Admin data refresh failed:', error);
            setAdminLoadError(message);
          });
      });

      source.addEventListener('heartbeat', () => {
        // Keepalive only.
      });

      source.onerror = () => {
        closeCurrent();
        if (closed) return;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      closeCurrent();
    };
  }, [
    authToken,
    ready,
    subscriptionFilter,
    premiumRequestStatusFilter,
    premiumRequestQuery,
    passwordRecoveryStatusFilter,
    passwordRecoveryQuery,
  ]);

  useEffect(() => {
    if (!selectedHierarchy) return;

    const subjectNode = syllabusTree.find((item) => item.subject === selectedHierarchy.subject);
    const matchedChapter = selectedHierarchy.kind === 'section'
      ? (subjectNode?.chapters || []).find((chapter) => chapter.title === selectedHierarchy.chapterTitle && chapter.part === selectedHierarchy.part)
      : null;
    const matchedChapterKey = matchedChapter?.key || '';

    setForm((prev) => ({
      ...prev,
      subject: selectedHierarchy.subject,
      part: selectedHierarchy.kind === 'section' ? selectedHierarchy.part : '',
      chapter: selectedHierarchy.kind === 'section' ? selectedHierarchy.chapterTitle : '',
      section: selectedHierarchy.sectionTitle,
      topic: selectedHierarchy.kind === 'section'
        ? `${selectedHierarchy.chapterTitle} - ${selectedHierarchy.sectionTitle}`
        : selectedHierarchy.sectionTitle,
    }));
    setUploadChapterKey(matchedChapterKey);

    setBulkDeleteSubject(selectedHierarchy.subject);
    if (selectedHierarchy.kind === 'section') {
      setBulkDeletePart(selectedHierarchy.part);
      setBulkDeleteChapter(selectedHierarchy.chapterTitle);
      setBulkDeleteChapterKey(matchedChapterKey);
      setBulkDeleteSectionOrTopic(selectedHierarchy.sectionTitle);
    } else {
      setBulkDeletePart('');
      setBulkDeleteChapter('');
      setBulkDeleteChapterKey('');
      setBulkDeleteSectionOrTopic(selectedHierarchy.sectionTitle);
    }

    setBankFilterSubject(selectedHierarchy.subject);
    setBankFilterPart(selectedHierarchy.kind === 'section' ? selectedHierarchy.part : '');
    setBankFilterChapterKey(matchedChapterKey);
    setBankFilterSection(selectedHierarchy.sectionTitle);
  }, [selectedHierarchy, syllabusTree]);

  useEffect(() => {
    if (!selectedHierarchy) {
      setBankEditDrafts({});
      setBankSavingIds({});
      return;
    }

    const nextDrafts: Record<string, EditableBankMcq> = {};
    mcqs.forEach((item) => {
      nextDrafts[item.id] = createEditableBankMcq(item);
    });
    setBankEditDrafts(nextDrafts);
    setBankSavingIds({});
  }, [selectedHierarchy, mcqs]);

  useEffect(() => {
    if (!isQuestionBankView) return;

    if (!bankTree.length) {
      if (bankSubjectKey || bankChapterKey || bankSectionKey) {
        setBankSubjectKey('');
        setBankChapterKey('');
        setBankSectionKey('');
      }
      return;
    }

    const subject = bankTree.find((item) => item.key === bankSubjectKey);
    if (!subject) {
      if (bankSubjectKey) setBankSubjectKey('');
      if (bankChapterKey) setBankChapterKey('');
      if (bankSectionKey) setBankSectionKey('');
      return;
    }

    const chapter = subject.chapters.find((item) => item.key === bankChapterKey);
    if (!chapter) {
      if (bankChapterKey) setBankChapterKey('');
      if (bankSectionKey) setBankSectionKey('');
      return;
    }

    if (bankSectionKey && !chapter.sections.some((item) => item.key === bankSectionKey)) {
      setBankSectionKey('');
    }
  }, [isQuestionBankView, bankTree, bankSubjectKey, bankChapterKey, bankSectionKey]);

  useEffect(() => {
    if (!isQuestionBankView || !authToken || !activeBankSubject || !activeBankChapter || !activeBankSection) return;
    void loadBankMcqs(
      authToken,
      activeBankSubject.key,
      activeBankChapter.key,
      activeBankChapter.label,
      activeBankSection.label,
    ).catch(() => {
      setBankMcqs([]);
      toast.error('Could not load question bank items for this section.');
    });
  }, [isQuestionBankView, authToken, activeBankSubject, activeBankChapter, activeBankSection]);

  const login = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const payload = await apiRequest<{ token?: string; refreshToken?: string; user: LoginUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });

      if (payload.user?.role !== 'admin') {
        toast.error('Admin access required for this panel.');
        return;
      }

      // Production API often omits JWTs from JSON (`ISSUE_AUTH_BODY_TOKENS=false`) and uses httpOnly cookies instead.
      if (payload.token) {
        localStorage.setItem(TOKEN_KEY, payload.token);
        if (payload.refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
        } else {
          localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
        setToken(payload.token);
        setRefreshToken(payload.refreshToken ?? null);
      } else {
        localStorage.setItem(TOKEN_KEY, COOKIE_SESSION_API_MARKER);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setToken(COOKIE_SESSION_API_MARKER);
        setRefreshToken(null);
      }
      navigateToSection('dashboard');
      toast.success('Admin login successful.');

      const tokenForAdminRequests = payload.token ?? COOKIE_SESSION_API_MARKER;
      void loadAdminData(tokenForAdminRequests).catch((error) => {
        const status = Number((error as { status?: number } | null)?.status || 0);
        if (status === 401 || status === 403) {
          clearAdminSession();
          toast.error('Session expired after login. Please sign in again.');
          return;
        }
        toast.error('Login succeeded, but admin data failed to load. Please click Refresh Data.');
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    void apiRequest('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }).catch(() => undefined);
    clearAdminSession();
  };

  const removeUser = async (user: AdminUser) => {
    if (!authToken) return;
    if (user.role === 'admin') {
      toast.error('For safety, admin accounts cannot be removed from this panel.');
      return;
    }
    if (!window.confirm(`Remove ${user.email}? They will have to login/register again.`)) return;

    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' }, authToken);
      toast.success('User removed successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove user.');
    }
  };

  const createUserAccount = async () => {
    if (!authToken) return;

    if (!createUserForm.email.trim() || !createUserForm.mobileNumber.trim() || !createUserForm.password.trim()) {
      toast.error('Email, mobile number, and password are required.');
      return;
    }

    if (createUserForm.password.trim().length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsCreatingUser(true);
      await apiRequest('/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          firstName: createUserForm.firstName,
          lastName: createUserForm.lastName,
          email: createUserForm.email.trim(),
          mobileNumber: createUserForm.mobileNumber.trim(),
          password: createUserForm.password,
          activatePlan: createUserForm.activatePlan,
          planId: createUserForm.planId,
        }),
      }, authToken);

      toast.success('User account created successfully.');
      setCreateUserForm({
        firstName: '',
        lastName: '',
        email: '',
        mobileNumber: '',
        password: '',
        activatePlan: false,
        planId: createUserForm.planId,
      });
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create user account.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const fillGeneratedTemporaryPassword = async () => {
    const generated = generateTemporaryPassword(12);
    setCreateUserForm((prev) => ({ ...prev, password: generated }));

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generated);
        toast.success('Temporary password generated and copied.');
        return;
      }
    } catch {
      // Continue with generated-only success feedback.
    }

    toast.success('Temporary password generated.');
  };

  const copyTemporaryPassword = async () => {
    const currentPassword = createUserForm.password.trim();
    if (!currentPassword) {
      toast.error('Enter or generate a password first.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentPassword);
      } else {
        const temp = document.createElement('textarea');
        temp.value = currentPassword;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Password copied.');
    } catch {
      toast.error('Could not copy password.');
    }
  };

  const approveSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ requestId: string; token: { code: string; expiresAt: string } }>(
        `/api/admin/signup-requests/${request.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment verified by admin.' }),
        },
        authToken,
      );
      setIssuedTokens((prev) => ({ ...prev, [request.id]: payload.token.code }));
      setSignupRequests((prev) => prev.map((item) => (item.id === request.id
        ? {
            ...item,
            status: 'approved',
            codeDeliveryStatus: 'pending_send',
          }
        : item)));
      toast.success(`Approved. Activation code generated: ${payload.token.code}`);
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve request.');
    }
  };

  const rejectSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Payment could not be verified.' }),
      }, authToken);
      toast.success('Request rejected.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject request.');
    }
  };

  const approvePremiumRequest = async (request: PremiumSubscriptionRequest) => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ requestId: string; token: { code: string; expiresAt: string } }>(
        `/api/admin/subscriptions/requests/${request.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment verified by admin.' }),
        },
        authToken,
      );
      setIssuedPremiumTokens((prev) => ({ ...prev, [request.id]: payload.token.code }));
      toast.success(`Premium request approved. Token: ${payload.token.code}`);
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve premium request.');
    }
  };

  const rejectPremiumRequest = async (request: PremiumSubscriptionRequest) => {
    if (!authToken) return;
    try {
      await apiRequest(
        `/api/admin/subscriptions/requests/${request.id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment could not be verified.' }),
        },
        authToken,
      );
      toast.success('Premium request rejected.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject premium request.');
    }
  };

  const copyToken = async (tokenCode: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tokenCode);
      } else {
        const temp = document.createElement('textarea');
        temp.value = tokenCode;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Token copied to clipboard.');
    } catch {
      toast.error('Could not copy token.');
    }
  };

  const sendCodeInApp = async (requestId: string, purpose: 'signup' | 'premium') => {
    if (!authToken) return;
    try {
      const endpoint = purpose === 'premium'
        ? `/api/admin/subscriptions/requests/${requestId}/send-code`
        : `/api/admin/signup-requests/${requestId}/send-code`;

      await apiRequest(endpoint, { method: 'POST' }, authToken);
      toast.success('Code sent in-app successfully. User token field will auto-fill.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send code in-app.');
    }
  };

  const loadSupportThread = async (userId: string, activeToken = authToken) => {
    if (!activeToken || !userId) return;
    try {
      setIsSupportThreadLoading(true);
      const payload = await apiRequest<AdminSupportThreadPayload>(`/api/admin/support-chat/messages/${userId}`, {}, activeToken);
      setActiveSupportUser(payload.user || null);
      setSupportMessages(payload.messages || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load support thread.');
    } finally {
      setIsSupportThreadLoading(false);
    }
  };

  const sendSupportReply = async () => {
    if (!authToken || !selectedSupportUserId) return;
    if (activeSupportUser?.isDeleted) {
      toast.error('This user account was deleted. Thread is read-only.');
      return;
    }
    const text = supportReplyText.trim();
    const messageType = supportReplyAttachment ? 'file' : 'text';
    if (messageType === 'text' && !text) return;
    try {
      setIsSendingSupportReply(true);
      await apiRequest(`/api/admin/support-chat/messages/${selectedSupportUserId}`, {
        method: 'POST',
        body: JSON.stringify({
          messageType,
          text,
          attachment: supportReplyAttachment,
        }),
      }, authToken);
      setSupportReplyText('');
      setSupportReplyAttachment(null);
      await Promise.all([
        loadSupportThread(selectedSupportUserId),
        apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, authToken)
          .then((payload) => setSupportConversations(payload.conversations || []))
          .catch(() => undefined),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send support reply.');
    } finally {
      setIsSendingSupportReply(false);
    }
  };

  const onSupportReplyFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;

    if (selected.size > ADMIN_SUPPORT_ATTACHMENT_MAX_BYTES) {
      toast.error('File exceeds 8MB size limit.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      setSupportReplyAttachment({
        name: selected.name,
        mimeType: String(selected.type || 'application/octet-stream').toLowerCase(),
        size: selected.size,
        dataUrl,
      });
      toast.success('File attached to admin reply.');
    } catch {
      toast.error('Could not read selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const reactToSupportMessage = async (messageId: string, emoji: string) => {
    if (!authToken || !selectedSupportUserId) return;
    try {
      await apiRequest(`/api/admin/support-chat/messages/${selectedSupportUserId}/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, authToken);
      await loadSupportThread(selectedSupportUserId, authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update reaction.');
    }
  };

  const openPaymentProof = async (path: string, fileName: string, fallbackDataUrl?: string, download = false) => {
    const fallback = String(fallbackDataUrl || '').trim();
    const previewWindow = !download ? window.open('', '_blank', 'noopener,noreferrer') : null;

    if (!authToken) {
      if (fallback.startsWith('data:')) {
        if (download) {
          if (!downloadDataUrlFile(fallback, fileName || 'payment-proof')) {
            toast.error('Could not download payment proof file.');
          }
        } else {
          const opened = openDataUrlPreview(fallback);
          if (!opened && previewWindow) previewWindow.close();
        }
        return;
      }
      if (previewWindow) previewWindow.close();
      toast.error('Session expired. Please log in again to access payment proof.');
      return;
    }

    try {
      const response = await fetch(path, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Proof request failed (${response.status})`);
      }

      const blob = await response.blob();

      if (download) {
        downloadBlobFile(blob, fileName || 'payment-proof');
      } else {
        openBlobPreview(blob, previewWindow);
      }
      return;
    } catch {
      if (fallback.startsWith('data:')) {
        if (download) {
          if (!downloadDataUrlFile(fallback, fileName || 'payment-proof')) {
            toast.error('Could not download payment proof file.');
          }
        } else {
          const opened = openDataUrlPreview(fallback);
          if (!opened && previewWindow) previewWindow.close();
        }
        return;
      }
      if (previewWindow) previewWindow.close();
      toast.error('Could not open payment proof. Please try again.');
    }
  };

  useEffect(() => {
    if (!authToken) return;
    if (!selectedSupportUserId) {
      if (supportConversations.length) {
        setSelectedSupportUserId(supportConversations[0].userId);
      }
      return;
    }

    void loadSupportThread(selectedSupportUserId, authToken);
  }, [selectedSupportUserId, authToken]);

  useEffect(() => {
    if (!supportConversations.length) {
      setSelectedSupportUserId('');
      setActiveSupportUser(null);
      setSupportMessages([]);
      return;
    }

    const selectedExistsInAll = supportConversations.some((item) => item.userId === selectedSupportUserId);
    const selectedExistsInFiltered = filteredSupportConversations.some((item) => item.userId === selectedSupportUserId);
    const shouldReselect = !selectedSupportUserId || !selectedExistsInAll || (supportConversationQuery.trim() && !selectedExistsInFiltered);

    if (shouldReselect) {
      const source = filteredSupportConversations.length ? filteredSupportConversations : supportConversations;
      setSelectedSupportUserId(source[0].userId);
    }
  }, [supportConversations, filteredSupportConversations, selectedSupportUserId, supportConversationQuery]);

  useEffect(() => {
    lastUserMessageInThreadRef.current = '';
  }, [selectedSupportUserId]);

  useEffect(() => {
    const unreadTotal = supportConversations.reduce((sum, item) => sum + Number(item.unreadForAdmin || 0), 0);
    if (!didHydrateSupportRef.current) {
      didHydrateSupportRef.current = true;
      lastUnreadTotalRef.current = unreadTotal;
      return;
    }

    if (unreadTotal > lastUnreadTotalRef.current) {
      const latestIncoming = supportConversations.find((item) => Number(item.unreadForAdmin || 0) > 0);
      playNotificationTone();
      toast.message('New incoming support message');
      notifyAdminDesktop(
        'NET360 Support Admin',
        latestIncoming
          ? `${latestIncoming.userName || latestIncoming.email}: ${latestIncoming.lastMessageText || 'New message'}`
          : 'You have new incoming support messages.',
      );
    }
    lastUnreadTotalRef.current = unreadTotal;
  }, [supportConversations]);

  useEffect(() => {
    const latestUserMessage = [...supportMessages].reverse().find((item) => item.senderRole === 'user');
    const latestUserMessageId = latestUserMessage?.id || '';
    if (!latestUserMessageId) return;

    if (!lastUserMessageInThreadRef.current) {
      lastUserMessageInThreadRef.current = latestUserMessageId;
      return;
    }

    if (latestUserMessageId !== lastUserMessageInThreadRef.current) {
      lastUserMessageInThreadRef.current = latestUserMessageId;
      playNotificationTone();
      toast.message('New message in active support thread');
      notifyAdminDesktop(
        'NET360 Active Thread',
        latestUserMessage?.text || 'You have a new message in the active support thread.',
      );
    }
  }, [supportMessages]);

  useEffect(() => {
    if (!authToken) return;

    const timer = window.setInterval(() => {
      void apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, authToken)
        .then((payload) => setSupportConversations(payload.conversations || []))
        .catch(() => undefined);

      if (selectedSupportUserId) {
        void loadSupportThread(selectedSupportUserId, authToken);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [authToken, selectedSupportUserId]);

  useEffect(() => {
    setBulkAnalysisReady(false);
  }, [bulkFile, bulkInput]);

  const openGestureImageEditorForFile = async (file: File, target: ManualImageEditorTarget) => {
    if (!isSupportedMcqImage(file)) {
      toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
      return;
    }
    if (file.size > MCQ_IMAGE_MAX_BYTES) {
      toast.error('Image is too large. Maximum size is 5 MB.');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const natural = await getImageNaturalSize(dataUrl);
      const viewportWidth = Math.max(1, window.innerWidth);
      const viewportHeight = Math.max(1, window.innerHeight - 56);

      setGestureImageEditor({
        isOpen: true,
        sourceDataUrl: dataUrl,
        fileName: file.name || 'image.jpg',
        target,
        naturalWidth: natural.width,
        naturalHeight: natural.height,
        viewportWidth,
        viewportHeight,
        zoom: 1,
        rotation: 0,
        translateX: 0,
        translateY: 0,
        crop: createInitialGestureCrop(viewportWidth, viewportHeight),
      });
      pointerMapRef.current.clear();
      imageGestureRef.current = null;
      cropDragStateRef.current = null;
    } catch {
      toast.error('Could not open image editor.');
    }
  };

  const closeGestureImageEditor = () => {
    if (isApplyingGestureCrop) return;
    setGestureImageEditor((prev) => ({ ...prev, isOpen: false, target: null, sourceDataUrl: '' }));
    pointerMapRef.current.clear();
    imageGestureRef.current = null;
    cropDragStateRef.current = null;
  };

  const applyGestureImageEditor = async () => {
    if (!gestureImageEditor.isOpen || !gestureImageEditor.target || !gestureImageEditor.sourceDataUrl) return;

    setIsApplyingGestureCrop(true);
    try {
      const croppedDataUrl = await renderGestureCropToDataUrl(gestureImageEditor);
      const parsedImage = parsedDataUrlToImage(croppedDataUrl, String(gestureImageEditor.fileName || 'editor-image').replace(/\.[^.]+$/, '') || 'editor-image');
      if (!parsedImage) {
        throw new Error('Could not prepare cropped image.');
      }

      const target = gestureImageEditor.target;
      if (target.kind === 'question') {
        setForm((prev) => ({
          ...prev,
          questionType: 'text',
          questionImage: null,
        }));
        insertImageTokenToFieldWithRetry('questionInput', parsedImage.dataUrl);
      } else if (target.kind === 'option') {
        const optionFieldId = `option-input-${normalizeMathInputId(target.optionKey)}`;
        setForm((prev) => {
          if (target.optionIndex < 0 || target.optionIndex >= prev.optionMedia.length) return prev;
          const optionTypes = [...prev.optionTypes];
          optionTypes[target.optionIndex] = 'text';
          const optionMedia = [...prev.optionMedia];
          const existing = optionMedia[target.optionIndex];
          optionMedia[target.optionIndex] = {
            ...existing,
            image: null,
          };
          return { ...prev, optionTypes, optionMedia };
        });
        insertImageTokenToFieldWithRetry(optionFieldId, parsedImage.dataUrl);
      } else if (target.kind === 'explanation') {
        setForm((prev) => ({
          ...prev,
          explanationImage: null,
          shortTrickImage: null,
        }));
        insertImageTokenToFieldWithRetry('explanationInput', parsedImage.dataUrl);
      }

      closeGestureImageEditor();
      toast.success('Photo inserted into editor.');
    } catch {
      toast.error('Could not apply photo edits.');
    } finally {
      setIsApplyingGestureCrop(false);
    }
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>, handle: GestureCropHandle) => {
    if (!gestureImageEditor.isOpen) return;
    cropDragStateRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: { ...gestureImageEditor.crop },
    };
  };

  const beginImagePointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gestureImageEditor.isOpen) return;
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const entries = Array.from(pointerMapRef.current.entries());
    if (entries.length === 1) {
      imageGestureRef.current = {
        mode: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTranslateX: gestureImageEditor.translateX,
        startTranslateY: gestureImageEditor.translateY,
      };
      return;
    }

    if (entries.length >= 2) {
      const [a, b] = entries;
      const dx = b[1].x - a[1].x;
      const dy = b[1].y - a[1].y;
      imageGestureRef.current = {
        mode: 'pinch',
        pointerA: a[0],
        pointerB: b[0],
        startDistance: Math.hypot(dx, dy),
        startAngle: Math.atan2(dy, dx),
        startMidX: (a[1].x + b[1].x) / 2,
        startMidY: (a[1].y + b[1].y) / 2,
        startZoom: gestureImageEditor.zoom,
        startRotation: gestureImageEditor.rotation,
        startTranslateX: gestureImageEditor.translateX,
        startTranslateY: gestureImageEditor.translateY,
      };
    }
  };

  useEffect(() => {
    if (!gestureImageEditor.isOpen) return;

    const handlePointerMove = (event: PointerEvent) => {
      const surface = gestureSurfaceRef.current;
      if (!surface) return;

      if (pointerMapRef.current.has(event.pointerId)) {
        pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      const cropDrag = cropDragStateRef.current;
      if (cropDrag) {
        event.preventDefault();
        const dx = event.clientX - cropDrag.startX;
        const dy = event.clientY - cropDrag.startY;
        const start = cropDrag.startCrop;
        let next: GestureCropRect = { ...start };

        if (cropDrag.handle === 'move') {
          next.x = start.x + dx;
          next.y = start.y + dy;
        } else {
          if (cropDrag.handle.includes('e')) next.width = start.width + dx;
          if (cropDrag.handle.includes('s')) next.height = start.height + dy;
          if (cropDrag.handle.includes('w')) {
            next.x = start.x + dx;
            next.width = start.width - dx;
          }
          if (cropDrag.handle.includes('n')) {
            next.y = start.y + dy;
            next.height = start.height - dy;
          }
        }

        setGestureImageEditor((prev) => ({
          ...prev,
          crop: normalizeEditorCrop(next, prev.viewportWidth, prev.viewportHeight),
        }));
        return;
      }

      const gesture = imageGestureRef.current;
      if (!gesture) return;

      if (gesture.mode === 'pan') {
        if (gesture.pointerId !== event.pointerId) return;
        event.preventDefault();
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        setGestureImageEditor((prev) => ({
          ...prev,
          translateX: gesture.startTranslateX + dx,
          translateY: gesture.startTranslateY + dy,
        }));
        return;
      }

      if (gesture.mode === 'pinch') {
        const pointA = pointerMapRef.current.get(gesture.pointerA);
        const pointB = pointerMapRef.current.get(gesture.pointerB);
        if (!pointA || !pointB) return;
        event.preventDefault();

        const dx = pointB.x - pointA.x;
        const dy = pointB.y - pointA.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const angle = Math.atan2(dy, dx);
        const midX = (pointA.x + pointB.x) / 2;
        const midY = (pointA.y + pointB.y) / 2;

        const zoom = clampNumber(
          gesture.startZoom * (distance / Math.max(1, gesture.startDistance)),
          GESTURE_EDITOR_MIN_ZOOM,
          GESTURE_EDITOR_MAX_ZOOM,
        );

        setGestureImageEditor((prev) => ({
          ...prev,
          zoom,
          rotation: gesture.startRotation + (angle - gesture.startAngle),
          translateX: gesture.startTranslateX + (midX - gesture.startMidX),
          translateY: gesture.startTranslateY + (midY - gesture.startMidY),
        }));
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      pointerMapRef.current.delete(event.pointerId);

      if (cropDragStateRef.current) {
        cropDragStateRef.current = null;
      }

      const gesture = imageGestureRef.current;
      if (!gesture) return;

      const entries = Array.from(pointerMapRef.current.entries());
      if (!entries.length) {
        imageGestureRef.current = null;
        return;
      }

      if (entries.length === 1) {
        const [only] = entries;
        setGestureImageEditor((prev) => {
          imageGestureRef.current = {
            mode: 'pan',
            pointerId: only[0],
            startX: only[1].x,
            startY: only[1].y,
            startTranslateX: prev.translateX,
            startTranslateY: prev.translateY,
          };
          return prev;
        });
      } else {
        const [a, b] = entries;
        setGestureImageEditor((prev) => {
          const dx = b[1].x - a[1].x;
          const dy = b[1].y - a[1].y;
          imageGestureRef.current = {
            mode: 'pinch',
            pointerA: a[0],
            pointerB: b[0],
            startDistance: Math.max(1, Math.hypot(dx, dy)),
            startAngle: Math.atan2(dy, dx),
            startMidX: (a[1].x + b[1].x) / 2,
            startMidY: (a[1].y + b[1].y) / 2,
            startZoom: prev.zoom,
            startRotation: prev.rotation,
            startTranslateX: prev.translateX,
            startTranslateY: prev.translateY,
          };
          return prev;
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [gestureImageEditor.isOpen]);

  useEffect(() => {
    if (!gestureImageEditor.isOpen) return;
    const handleResize = () => {
      setGestureImageEditor((prev) => {
        const viewportWidth = Math.max(1, window.innerWidth);
        const viewportHeight = Math.max(1, window.innerHeight - 56);
        return {
          ...prev,
          viewportWidth,
          viewportHeight,
          crop: normalizeEditorCrop(prev.crop, viewportWidth, viewportHeight),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [gestureImageEditor.isOpen]);

  const resetForm = () => {
    const fresh = emptyForm();
    if (selectedHierarchy) {
      fresh.subject = selectedHierarchy.subject;
      if (selectedHierarchy.kind === 'section') {
        fresh.part = selectedHierarchy.part;
        fresh.chapter = selectedHierarchy.chapterTitle;
        fresh.section = selectedHierarchy.sectionTitle;
        fresh.topic = `${selectedHierarchy.chapterTitle} - ${selectedHierarchy.sectionTitle}`;
      } else {
        fresh.part = '';
        fresh.chapter = '';
        fresh.section = selectedHierarchy.sectionTitle;
        fresh.topic = selectedHierarchy.sectionTitle;
      }
    }
    setForm(fresh);
  };

  const handleAddMCQ = async (event?: Pick<FormEvent<HTMLFormElement>, 'preventDefault'> & { stopPropagation?: () => void }) => {
    event?.preventDefault();
    event?.stopPropagation?.();

    if (isSavingMcq) return;
    if (!authToken) {
      toast.error('Failed to add MCQ');
      return;
    }

    const normalizedOptionMedia = form.optionMedia
      .map((item, idx) => ({
        key: String(item.key || String.fromCharCode(65 + idx)).trim().toUpperCase(),
        text: String(item.text || '').trim(),
        image: item.image || null,
      }))
      .filter((item) => item.text || item.image);

    const options = normalizedOptionMedia.map((item) => item.text || `[${item.key}]`);

    const normalizedQuestionType = form.questionType === 'image' ? 'image' : 'text';
    if (normalizedQuestionType === 'text' && !String(form.question || '').trim()) {
      toast.error('Question Text is required.');
      return;
    }

    if (normalizedQuestionType === 'image' && !form.questionImage) {
      toast.error('Question Image is required when Question Input Type is Image.');
      return;
    }

    const requiredOptionKeys = ['A', 'B', 'C', 'D'];
    const missingRequiredOption = requiredOptionKeys.find((key, idx) => {
      const option = form.optionMedia[idx];
      const optionType = form.optionTypes[idx] === 'image' ? 'image' : 'text';
      if (!option) return true;
      if (optionType === 'image') {
        return !option.image;
      }
      return !String(option.text || '').trim();
    });

    if (missingRequiredOption) {
      toast.error('Options A, B, C, and D are required.');
      return;
    }

    if (!String(form.answer || '').trim()) {
      toast.error('Correct Answer is required.');
      return;
    }

    const answerKey = resolveAnswerKeyFromInput(normalizedOptionMedia, form.answer);
    if (!answerKey) {
      toast.error('Provide a valid answer (A-D, option number, or exact option text).');
      return;
    }

    const selectedContext = {
      subject: String(form.subject || selectedHierarchy?.subject || '').trim().toLowerCase(),
      part: String(
        form.part
          || (selectedHierarchy?.kind === 'section' ? selectedHierarchy.part : ''),
      ).trim().toLowerCase(),
      chapter: String(
        form.chapter
          || (selectedHierarchy?.kind === 'section' ? selectedHierarchy.chapterTitle : ''),
      ).trim(),
      section: String(form.section || selectedHierarchy?.sectionTitle || '').trim(),
      topic: String(form.topic || form.section || selectedHierarchy?.sectionTitle || '').trim(),
    };

    const normalizedSubject = String(selectedContext.subject || '').toLowerCase().trim();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizedSubject);
    const requiresPartSelection = isPartSelectionRequiredSubject(normalizedSubject);

    if (!normalizedSubject) {
      toast.error('Subject is required before adding MCQs.');
      return;
    }

    if (!String(selectedContext.section || '').trim()) {
      toast.error('Section is required.');
      return;
    }

    if (!String(selectedContext.topic || '').trim()) {
      toast.error('Topic is required.');
      return;
    }

    if (!isFlatTopicSubject && requiresPartSelection && !String(selectedContext.part || '').trim()) {
      toast.error('Part is required.');
      return;
    }

    if (!isFlatTopicSubject && !String(selectedContext.chapter || '').trim()) {
      toast.error('Chapter is required.');
      return;
    }

    const payload = {
      question_type: normalizedQuestionType,
      question_text: String(form.question || '').trim(),
      question_image: form.questionImage || null,
      question: form.question,
      option_a: options[0] || '',
      option_b: options[1] || '',
      option_c: options[2] || '',
      option_d: options[3] || '',
      options_structured: {
        A: { type: form.optionTypes[0] === 'image' ? 'image' : 'text', value: form.optionTypes[0] === 'image' ? (form.optionMedia[0]?.image?.dataUrl || '') : (form.optionMedia[0]?.text || '') },
        B: { type: form.optionTypes[1] === 'image' ? 'image' : 'text', value: form.optionTypes[1] === 'image' ? (form.optionMedia[1]?.image?.dataUrl || '') : (form.optionMedia[1]?.text || '') },
        C: { type: form.optionTypes[2] === 'image' ? 'image' : 'text', value: form.optionTypes[2] === 'image' ? (form.optionMedia[2]?.image?.dataUrl || '') : (form.optionMedia[2]?.text || '') },
        D: { type: form.optionTypes[3] === 'image' ? 'image' : 'text', value: form.optionTypes[3] === 'image' ? (form.optionMedia[3]?.image?.dataUrl || '') : (form.optionMedia[3]?.text || '') },
      },
      correct_answer: answerKey,
      explanation: form.explanationText,
      subject: normalizedSubject,
      part: isFlatTopicSubject ? '' : (requiresPartSelection ? selectedContext.part : ''),
      chapter: isFlatTopicSubject ? '' : selectedContext.chapter,
      section: isFlatTopicSubject ? (selectedContext.section || selectedContext.topic) : selectedContext.section,
      topic: selectedContext.topic,
      subject_id: normalizedSubject,
      chapter_id: String(selectedContext.chapter || '').trim(),
      section_id: String(selectedContext.section || selectedContext.topic || '').trim(),
      topic_id: String(selectedContext.topic || '').trim(),
      questionImage: form.questionImage,
      options,
      optionMedia: normalizedOptionMedia,
      answer: answerKey,
      answerKey,
      tip: form.explanationText,
      explanationText: form.explanationText,
      explanationImage: form.explanationImage,
      shortTrickText: '',
      shortTrickImage: null,
      difficulty: form.difficulty,
    };

    try {
      setIsSavingMcq(true);
      if (form.id) {
        const updateResult = await apiRequest<{ mcq?: AdminMCQ }>(`/api/admin/mcqs/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);

        if (updateResult?.mcq?.id) {
          setMcqs((previous) => previous.map((item) => (item.id === updateResult.mcq!.id ? updateResult.mcq! : item)));
        }

        toast.success('MCQ updated.');
      } else {
        const createResult = await apiRequest<{ mcq?: AdminMCQ }>('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);

        if (!createResult?.mcq?.id) {
          throw new Error('MCQ was not saved.');
        }

        setMcqs((previous) => {
          const next = [createResult.mcq!, ...previous.filter((item) => item.id !== createResult.mcq!.id)];
          return next;
        });

        toast.success('MCQ added successfully');
      }

      resetForm();
      setQuery('');

      if (selectedHierarchy) {
        void loadSectionMcqs(authToken, selectedHierarchy).catch((error) => {
          toast.error(error instanceof Error ? error.message : 'MCQ saved, but section refresh failed. Use Refresh Data.');
        });
      }

      void apiRequest<{ structure: AdminMcqBankStructureItem[] }>('/api/admin/mcq-bank/structure', {}, authToken)
        .then((payload) => setMcqStructure(payload.structure || []))
        .catch(() => undefined);
    } catch (error) {
      console.error('Add MCQ failed:', error);
      toast.error(error instanceof Error ? error.message : (form.id ? 'Could not save MCQ.' : 'Failed to add MCQ.'));
    } finally {
      setIsSavingMcq(false);
    }
  };

  const submitMCQ = async () => {
    await handleAddMCQ();
  };

  const handleManualMcqSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMCQ();
  };

  const analyzeBulkMcqs = async (sourceOverride?: { text?: string; file?: File | null }) => {
    if (!authToken) return;

    const now = Date.now();
    if (bulkAnalyzeInFlightRef.current) {
      toast.message('Analysis is already running. Please wait...');
      return;
    }
    if (now - bulkAnalyzeLastClickRef.current < BULK_ANALYZE_DEBOUNCE_MS) {
      return;
    }

    const effectiveText = String(sourceOverride?.text ?? bulkInput);
    const effectiveFile = sourceOverride?.file === undefined ? bulkFile : sourceOverride.file;
    const hasText = Boolean(effectiveText.trim());
    if (!hasText && !effectiveFile) {
      toast.error('Paste MCQs or upload a PDF, DOC, DOCX, or TXT file first.');
      return;
    }

    if (effectiveFile && effectiveFile.size > 8 * 1024 * 1024) {
      toast.error('Uploaded file is too large. Maximum size is 8 MB.');
      return;
    }

    const hierarchyContext = resolveDocumentHierarchyContext(true);
    if (!hierarchyContext) {
      return;
    }

    bulkAnalyzeLastClickRef.current = now;
    bulkAnalyzeInFlightRef.current = true;
    const runId = ++bulkAnalyzeRunIdRef.current;

    try {
      setBulkProcessing(true);
      setBulkProcessingLabel('Checking backend...');
      setBulkAnalysisReady(false);
      const preflight = await runBackendPreflightCheck({
        timeoutMs: BULK_ANALYZE_PREFLIGHT_TIMEOUT_MS,
        attempts: 2,
        retryDelayMs: 900,
      });
      setBulkProcessingLabel('Analysing MCQs...');
      const aiParseEndpoint = `${preflight.apiPrefix}/ai/parse-mcqs`;
      const runApiParser = async (): Promise<ParsedBulkResponse> => {
        if (effectiveFile) {
          const formData = new FormData();
          formData.append('sourceType', 'file');
          formData.append('file', effectiveFile);
          return apiRequest<ParsedBulkResponse>(aiParseEndpoint, {
            method: 'POST',
            body: formData,
            timeoutMs: BULK_ANALYZE_REQUEST_TIMEOUT_MS,
          }, authToken);
        }

        return apiRequest<ParsedBulkResponse>(aiParseEndpoint, {
          method: 'POST',
          body: JSON.stringify({
            sourceType: 'text',
            rawText: effectiveText,
          }),
          timeoutMs: BULK_ANALYZE_REQUEST_TIMEOUT_MS,
        }, authToken);
      };
      const aiParseUrl = buildApiUrl(aiParseEndpoint);
      console.info('Admin Analyse by AI started', {
        healthUrl: preflight.healthUrl,
        endpoint: aiParseUrl,
        hasFile: Boolean(effectiveFile),
        sourceType: effectiveFile ? 'file' : 'text',
        subject: hierarchyContext.subject,
        part: hierarchyContext.part,
        chapter: hierarchyContext.chapter,
        section: hierarchyContext.section,
      });

      let payload: ParsedBulkResponse | null = null;
      let lastError: unknown = null;

      for (let attempt = 1; attempt <= BULK_ANALYZE_MAX_ATTEMPTS; attempt += 1) {
        try {
          if (attempt > 1) {
            setBulkProcessingLabel(`Retrying analysis (${attempt}/${BULK_ANALYZE_MAX_ATTEMPTS})...`);
          }

          payload = await runApiParser();
          const parsedItems = payload.parsed || [];

          if (!hasValidParsedMcqs(parsedItems)) {
            throw new Error(payload.errors?.[0] || 'No valid MCQs were extracted.');
          }
          break;
        } catch (error) {
          lastError = error;
          if (!effectiveFile && attempt === 1) {
            // Fallback keeps text mode reliable even if backend parser is unavailable.
            const localPayload = await parseBulkMcqsAsync(effectiveText);
            if (hasValidParsedMcqs(localPayload.parsed || [])) {
              payload = localPayload;
              break;
            }
          }

          if (attempt < BULK_ANALYZE_MAX_ATTEMPTS) {
            await delayMs(BULK_ANALYZE_RETRY_DELAY_MS * attempt);
          }
        }
      }

      if (!payload) {
        throw (lastError instanceof Error ? lastError : new Error('Could not parse MCQs after multiple attempts.'));
      }

      if (runId !== bulkAnalyzeRunIdRef.current) {
        return;
      }

      const withSelectedHierarchy = (payload.parsed || []).map((item) => {
        const subjectCandidate = String(item.subject || '').trim().toLowerCase();
        const subject = subjectCandidate || String(hierarchyContext.subject || '').trim().toLowerCase();
        const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(subject);
        const requiresPartSelection = !isFlatTopicSubject && isPartSelectionRequiredSubject(subject);
        const partCandidate = String(item.part || '').trim().toLowerCase();
        const part = isFlatTopicSubject
          ? ''
          : (requiresPartSelection ? (partCandidate || String(hierarchyContext.part || '').trim().toLowerCase()) : '');
        const chapter = isFlatTopicSubject
          ? ''
          : String(item.chapter || hierarchyContext.chapter || '').trim();
        const section = String(item.section || item.topic || hierarchyContext.section || '').trim();
        const topic = String(item.topic || section || hierarchyContext.topic || '').trim();

        return {
          ...item,
          subject,
          part,
          chapter,
          section,
          topic: topic || section,
        };
      });

      setBulkParsed(withSelectedHierarchy);
      setBulkParseErrors(payload.errors || []);
      setShowParsedPreview(true);

      if (!withSelectedHierarchy.length) {
        setBulkAnalysisReady(false);
        toast.error(payload.errors?.[0] || 'No questions were parsed after retries.');
        return;
      }

      const limitedParsed = withSelectedHierarchy.slice(0, 15);
      const didTrim = withSelectedHierarchy.length > limitedParsed.length;
      if (didTrim) {
        const nextErrors = [...(payload.errors || [])];
        if (!nextErrors.some((error) => /first 15 mcqs/i.test(error))) {
          nextErrors.unshift('Only the first 15 MCQs were kept from this import.');
        }
        setBulkParseErrors(nextErrors);
      }
      setBulkParsed(limitedParsed);
      setShowParsedPreview(true);
      setBulkAnalysisReady(true);
      setBulkProcessingLabel('Analysing MCQs...');

      console.info('Admin Analyse by AI completed', {
        parsedCount: limitedParsed.length,
        errors: payload.errors || [],
      });

      toast.success(`Parsed ${limitedParsed.length} MCQ(s). Review and confirm target before saving.`);
    } catch (error) {
      console.error('Admin Analyse by AI failed', error);
      if (runId === bulkAnalyzeRunIdRef.current) {
        setBulkParsed([]);
        setShowParsedPreview(false);
        setBulkAnalysisReady(false);
        setBulkParseErrors([error instanceof Error ? error.message : 'AI analysis failed. Please try again.']);
      }
      const status = Number((error as { status?: number } | null)?.status || 0);
      const aiParseUrl = buildApiUrl(AI_PARSE_ENDPOINT);
      if (status === 401 || status === 403) {
        toast.error('Admin session expired. Please log in again to continue AI analysis.');
      } else if (status >= 500) {
        toast.error('AI parser service is temporarily unavailable. Please retry in a moment.');
      } else if (error instanceof Error && /^Backend offline on\s+/i.test(error.message)) {
        toast.error(error.message);
      } else if (error instanceof Error && /timeout|network error|failed to fetch|cors|backend url/i.test(error.message)) {
        toast.error(`Could not reach AI parser at ${aiParseUrl}. Ensure backend server is running, URL/port is correct, and CORS allows this origin.`);
      } else {
        toast.error(error instanceof Error ? error.message : 'AI analysis failed after retries. Please try again.');
      }
    } finally {
      setBulkProcessing(false);
      setBulkProcessingLabel('Analysing MCQs...');
      bulkAnalyzeInFlightRef.current = false;
    }
  };

  const fillFieldsFromPastedMcq = () => {
    const editor = document.getElementById('paste-single-mcq-input') as HTMLElement | null;
    const normalizePastedEditorHtml = (value: string) => String(value || '')
      .replace(/<\s*imgsrc\b/gi, '<img src')
      .replace(/\bimgsrc\s*=/gi, 'img src=');

    const htmlCandidates = [
      String(editor?.innerHTML || '').trim(),
      String(editor?.shadowRoot?.innerHTML || '').trim(),
    ]
      .map((html) => normalizePastedEditorHtml(html).trim())
      .filter(Boolean);

    if (!htmlCandidates.length) {
      toast.error('No editable HTML content found in the Paste MCQ editor.');
      return;
    }

    const labelMatchers: Array<{ key: string; pattern: string }> = [
      { key: 'question', pattern: 'question' },
      { key: 'optionA', pattern: 'option\\s*a|optiona' },
      { key: 'optionB', pattern: 'option\\s*b|optionb' },
      { key: 'optionC', pattern: 'option\\s*c|optionc' },
      { key: 'optionD', pattern: 'option\\s*d|optiond' },
      { key: 'correctAnswer', pattern: 'correct\\s*answer|correctanswer' },
      { key: 'explanation', pattern: 'explanation' },
    ];

    const mappedByLabel: Record<string, string> = {};
    for (const html of htmlCandidates) {
      for (const matcher of labelMatchers) {
        if (mappedByLabel[matcher.key]) continue;
        const regex = new RegExp(`(?:^|>|\\n)\\s*(?:${matcher.pattern})\\s*:?\\s*(?:<[^>]+>\\s*)*<img[^>]*?src=["']([^"']+)["'][^>]*>`, 'i');
        const match = html.match(regex);
        const src = String(match?.[1] || '').trim();
        if (src) {
          mappedByLabel[matcher.key] = src;
        }
      }
    }

    const missing = labelMatchers
      .filter((item) => !mappedByLabel[item.key])
      .map((item) => item.key);
    if (missing.length) {
      toast.error(`Missing labeled image segment(s): ${missing.join(', ')}.`);
      return;
    }

    const mappedSources = [
      mappedByLabel.question,
      mappedByLabel.optionA,
      mappedByLabel.optionB,
      mappedByLabel.optionC,
      mappedByLabel.optionD,
      mappedByLabel.correctAnswer,
      mappedByLabel.explanation,
    ];

    const questionImage = parsedDataUrlToImage(mappedSources[0], 'question-image');
    const optionImages = [1, 2, 3, 4].map((idx) => parsedDataUrlToImage(mappedSources[idx], `option-${idx}-image`));
    const correctAnswerImage = parsedDataUrlToImage(mappedSources[5], 'correct-answer-image');
    const explanationImage = parsedDataUrlToImage(mappedSources[6], 'explanation-image');

    if (!questionImage || optionImages.some((image) => !image) || !correctAnswerImage || !explanationImage) {
      toast.error('Could not map one or more pasted image segments. Ensure images are valid data URLs.');
      return;
    }

    setPasteMcqCorrectAnswerImage(correctAnswerImage);

    setForm((previous) => {
      const optionMedia = [...previous.optionMedia];
      while (optionMedia.length < 4) {
        const nextKey = String.fromCharCode(65 + optionMedia.length);
        optionMedia.push({ key: nextKey, text: '', image: null });
      }

      for (let index = 0; index < 4; index += 1) {
        optionMedia[index] = {
          ...optionMedia[index],
          text: '',
          image: optionImages[index],
        };
      }

      const optionTypes = [...previous.optionTypes];
      while (optionTypes.length < optionMedia.length) {
        optionTypes.push('text');
      }
      for (let index = 0; index < 4; index += 1) {
        optionTypes[index] = 'image';
      }

      return {
        ...previous,
        questionType: 'image',
        question: '',
        questionImage,
        optionMedia,
        optionTypes,
        answer: previous.answer || 'A',
        explanationText: '',
        explanationImage,
      };
    });

    setBulkInput('');
    setBulkFile(null);

    const hierarchyContext = resolveDocumentHierarchyContext(true);
    if (!hierarchyContext) return;

    const withSelectedHierarchy: ParsedBulkMcq[] = [{
      subject: hierarchyContext.subject,
      part: hierarchyContext.part,
      chapter: hierarchyContext.chapter,
      section: hierarchyContext.section,
      topic: hierarchyContext.topic,
      question: '',
      questionImageUrl: '',
      questionImageDataUrl: mappedSources[0],
      options: ['', '', '', ''],
      optionImageDataUrls: [mappedSources[1], mappedSources[2], mappedSources[3], mappedSources[4]],
      answer: 'A',
      tip: '',
      shortTrick: `Correct Answer Image: <img src="${mappedSources[5]}" />`,
      explanationImageDataUrl: mappedSources[6],
      difficulty: 'Medium',
    }];

    setBulkParsed(withSelectedHierarchy);
    setBulkParseErrors([]);
    setShowParsedPreview(true);
    setBulkAnalysisReady(true);

    toast.success('Mapped pasted image segments to Question, Option A-D, Correct Answer, and Explanation fields.');
  };

  const splitPastedMcqImageIntoSegments = async (dataUrl: string) => {
    const source = String(dataUrl || '').trim();
    if (!source) return [] as string[];

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('Could not load pasted image for segmentation.'));
      node.src = source;
    });

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return [];

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) return [];

    sourceCtx.drawImage(image, 0, 0, width, height);
    const { data } = sourceCtx.getImageData(0, 0, width, height);

    const rowInk = new Array<number>(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      let inkCount = 0;
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + (x * 4);
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const intensity = (r + g + b) / 3;
        if (a > 10 && intensity < 245) {
          inkCount += 1;
        }
      }
      rowInk[y] = inkCount;
    }

    const minInkPixels = Math.max(2, Math.floor(width * 0.01));
    const rowActive = rowInk.map((count) => count >= minInkPixels);

    const rowRanges: Array<{ start: number; end: number }> = [];
    let start = -1;
    for (let y = 0; y < height; y += 1) {
      if (rowActive[y] && start < 0) {
        start = y;
      }
      if (!rowActive[y] && start >= 0) {
        rowRanges.push({ start, end: y - 1 });
        start = -1;
      }
    }
    if (start >= 0) {
      rowRanges.push({ start, end: height - 1 });
    }

    if (!rowRanges.length) return [];

    const padding = 2;
    const croppedRanges = rowRanges.map((range) => ({
      start: Math.max(0, range.start - padding),
      end: Math.min(height - 1, range.end + padding),
    }));

    const segments: string[] = [];
    for (let index = 0; index < croppedRanges.length; index += 1) {
      const startY = croppedRanges[index].start;
      const endY = croppedRanges[index].end;
      const sliceHeight = Math.max(1, (endY - startY) + 1);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = sliceHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(sourceCanvas, 0, startY, width, sliceHeight, 0, 0, width, sliceHeight);
      segments.push(canvas.toDataURL('image/png'));
    }

    return segments;
  };

  const handlePasteMcqImageSegmentation = async (dataUrl: string) => {
    try {
      const segments = await splitPastedMcqImageIntoSegments(dataUrl);
      if (segments.length < 7) {
        toast.error('Could not split pasted image into 7 segments. Use a clearer image.');
        return;
      }

      const formatted = [
        `Question: <img src="${segments[0]}" />`,
        `OptionA: <img src="${segments[1]}" />`,
        `OptionB: <img src="${segments[2]}" />`,
        `OptionC: <img src="${segments[3]}" />`,
        `OptionD: <img src="${segments[4]}" />`,
        `Correct Answer: <img src="${segments[5]}" />`,
        `Explanation: <img src="${segments[6]}" />`,
      ].join('\n');

      setSingleMcqInput((previousValue) => {
        const existing = String(previousValue || '').trimEnd();
        return existing ? `${existing}\n${formatted}` : formatted;
      });
      toast.success('Pasted image segmented into Question, A-D, Correct Answer, and Explanation fields.');
    } catch {
      toast.error('Could not process pasted image. Please try again.');
    }
  };

  const handlePasteMcqEditorPasteIntercept = (event: ClipboardDataEvent) => {
    const hasImageClipboardItem = Array.from(event.clipboardData?.items || []).some((item) =>
      String(item.type || '').toLowerCase().startsWith('image/'),
    );
    if (!hasImageClipboardItem) return false;

    // Block direct image insertion so only segmented, labeled lines are inserted.
    event.preventDefault();

    void extractPastedImageDataUrl(event)
      .then((dataUrl) => {
        if (!dataUrl) return;
        void handlePasteMcqImageSegmentation(dataUrl);
      })
      .catch(() => {
        toast.error('Could not process pasted image. Please try again.');
      });

    return true;
  };

  const resolveDocumentHierarchyContext = (showToast = true) => {
    const subject = String(form.subject || '').trim().toLowerCase();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(subject);
    const requiresPartSelection = isPartSelectionRequiredSubject(subject);
    const part = isFlatTopicSubject ? '' : (requiresPartSelection ? String(form.part || '').trim().toLowerCase() : '');
    const chapter = isFlatTopicSubject ? '' : String(form.chapter || '').trim();
    const section = String(form.section || '').trim();
    const topic = String(form.topic || form.section || '').trim();

    if (!subject) {
      if (showToast) toast.error('Select Subject before parsing or uploading document MCQs.');
      return null;
    }

    if (requiresPartSelection && !part) {
      if (showToast) toast.error('Select Part before parsing or uploading document MCQs.');
      return null;
    }

    if (!isFlatTopicSubject && !chapter) {
      if (showToast) toast.error('Select Chapter before parsing or uploading document MCQs.');
      return null;
    }

    if (!section) {
      if (showToast) toast.error('Select Section/Topic before parsing or uploading document MCQs.');
      return null;
    }

    const labelParts = [toTitleLabel(subject)];
    if (part) labelParts.push(part === 'part2' ? 'Part 2' : 'Part 1');
    if (chapter) labelParts.push(chapter);
    labelParts.push(section);

    return {
      subject,
      part,
      chapter,
      section,
      topic: topic || section,
      label: labelParts.join(' -> '),
    };
  };

  const resolveAiGenHierarchyContext = (showToast = true) => {
    const subject = String(aiGenSubject || '').trim().toLowerCase();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(subject);
    const requiresPartSelection = isPartSelectionRequiredSubject(subject);
    const part = isFlatTopicSubject ? '' : (requiresPartSelection ? String(aiGenPart || '').trim().toLowerCase() : '');
    const chapter = isFlatTopicSubject ? '' : String(aiGenChapter || '').trim();
    const section = String(aiGenSection || '').trim();
    const topic = String(aiGenTopic || aiGenSection || '').trim();

    if (!subject) {
      if (showToast) toast.error('Select Subject before generating AI MCQ.');
      return null;
    }
    if (requiresPartSelection && !part) {
      if (showToast) toast.error('Select Part before generating AI MCQ.');
      return null;
    }
    if (!isFlatTopicSubject && !chapter) {
      if (showToast) toast.error('Select Chapter before generating AI MCQ.');
      return null;
    }
    if (!section) {
      if (showToast) toast.error('Select Section/Topic before generating AI MCQ.');
      return null;
    }

    return {
      subject,
      part,
      chapter,
      section,
      topic: topic || section,
    };
  };

  const generateAiMcq = async () => {
    if (!authToken) return;
    if (aiGenGenerateInFlightRef.current || aiGenGenerating) return;

    const hierarchyContext = resolveAiGenHierarchyContext(true);
    if (!hierarchyContext) return;

    const hasText = Boolean(String(aiGenSourceText || '').trim());

    if (aiGenFile && aiGenFile.size > 20 * 1024 * 1024) {
      toast.error('Uploaded file is too large. Maximum size is 20 MB.');
      return;
    }

    aiGenGenerateInFlightRef.current = true;
    setAiGenGenerating(true);
    setAiGenGenerateErrors([]);

    try {
      const preflight = await runBackendPreflightCheck({
        timeoutMs: AI_GENERATE_PREFLIGHT_TIMEOUT_MS,
        attempts: AI_GENERATE_PREFLIGHT_ATTEMPTS,
        retryDelayMs: AI_GENERATE_PREFLIGHT_RETRY_DELAY_MS,
      });
      const aiGenerateEndpoint = `${preflight.apiPrefix}/generate-mcqs`;

      const baseGeneratePayload = {
        sourceType: aiGenFile ? 'file' : 'text',
        subject: hierarchyContext.subject,
        part: hierarchyContext.part,
        chapter: hierarchyContext.chapter,
        section: hierarchyContext.section,
        topic: hierarchyContext.topic,
        difficulty: aiGenDifficulty,
        instructions: String(aiGenInstructions || '').trim(),
        rawText: hasText ? aiGenSourceText.trim() : '',
      };

      const requestBody: FormData | string = (() => {
        if (!aiGenFile) {
          // JSON payload keeps text-only generation compatible with express.json middleware.
          return JSON.stringify(baseGeneratePayload);
        }

        const formData = new FormData();
        formData.append('sourceType', baseGeneratePayload.sourceType);
        formData.append('subject', baseGeneratePayload.subject);
        formData.append('part', baseGeneratePayload.part);
        formData.append('chapter', baseGeneratePayload.chapter);
        formData.append('section', baseGeneratePayload.section);
        formData.append('topic', baseGeneratePayload.topic);
        formData.append('difficulty', baseGeneratePayload.difficulty);
        formData.append('instructions', baseGeneratePayload.instructions);
        if (baseGeneratePayload.rawText) {
          formData.append('rawText', baseGeneratePayload.rawText);
        }
        formData.append('file', aiGenFile);
        return formData;
      })();

      const payload = await apiRequest<AiGeneratedMcqResponse>(aiGenerateEndpoint, {
        method: 'POST',
        body: requestBody,
        timeoutMs: AI_GENERATE_REQUEST_TIMEOUT_MS,
        retryCount: AI_GENERATE_RETRY_COUNT,
        retryDelayMs: AI_GENERATE_RETRY_DELAY_MS,
        retryOnStatuses: [408, 425, 429, 500, 502, 503, 504],
      }, authToken);

      const generatedList = Array.isArray(payload?.mcqs) && payload.mcqs.length
        ? payload.mcqs
        : (payload?.mcq ? [payload.mcq] : []);

      const normalizedGenerated: AiGeneratedMcqPayload[] = generatedList
        .filter((item) => item && item.question && Array.isArray(item.options) && item.options.length >= 4 && item.answer)
        .slice(0, AI_GENERATE_TARGET_COUNT)
        .map((item): AiGeneratedMcqPayload => ({
          question: String(item.question || '').trim(),
          options: item.options.slice(0, 4).map((option) => String(option || '').trim()),
          answer: String(item.answer || '').trim(),
          explanation: String(item.explanation || '').trim(),
          difficulty: item.difficulty === 'Easy' || item.difficulty === 'Hard' ? item.difficulty : 'Medium',
        }));

      if (normalizedGenerated.length !== AI_GENERATE_TARGET_COUNT) {
        throw new Error(payload?.errors?.[0] || `AI must return exactly ${AI_GENERATE_TARGET_COUNT} MCQs.`);
      }

      const parsedFromAi: ParsedBulkMcq[] = normalizedGenerated.map((item) => ({
        subject: hierarchyContext.subject,
        part: hierarchyContext.part,
        chapter: hierarchyContext.chapter,
        section: hierarchyContext.section,
        topic: hierarchyContext.topic,
        question: item.question,
        questionImageUrl: '',
        options: item.options,
        answer: item.answer,
        tip: item.explanation,
        shortTrick: '',
        difficulty: item.difficulty,
      }));

      setAiGenGenerated(normalizedGenerated[0] || null);
      setBulkParsed(parsedFromAi);
      setBulkParseErrors(Array.isArray(payload?.errors) ? payload.errors : []);
      setShowParsedPreview(true);
      setBulkAnalysisReady(true);
      setForm((previous) => ({
        ...previous,
        subject: hierarchyContext.subject,
        part: hierarchyContext.part,
        chapter: hierarchyContext.chapter,
        section: hierarchyContext.section,
        topic: hierarchyContext.topic,
        question: normalizedGenerated[0]?.question || previous.question,
        optionMedia: (normalizedGenerated[0]?.options || previous.optionMedia.map((item) => item.text)).slice(0, 4).map((text, index) => ({
          key: String.fromCharCode(65 + index),
          text: String(text || '').trim(),
          image: null,
        })),
        answer: normalizedGenerated[0]?.answer || previous.answer,
        explanationText: normalizedGenerated[0]?.explanation || previous.explanationText,
        difficulty: normalizedGenerated[0]?.difficulty || previous.difficulty,
      }));
      setUploadChapterKey(aiGenChapterKey || '');
      setUploadMode('document');
      setAiGenGenerateErrors(Array.isArray(payload?.errors) ? payload.errors : []);
      toast.success(`AI generated exactly ${normalizedGenerated.length} MCQs. Review/edit the populated blocks and upload.`);
    } catch (error) {
      const status = Number((error as { status?: number } | null)?.status || 0);
      const endpoint = buildApiUrl(AI_GENERATE_ENDPOINT);
      let message = error instanceof Error ? error.message : 'Could not generate AI MCQ.';

      if (status === 401 || status === 403) {
        message = 'Admin session expired. Please log in again and retry AI generation.';
      } else if (status >= 500 || /timeout|network error|failed to fetch|backend offline|cors/i.test(message)) {
        message = `Could not reach AI generation service at ${endpoint}. The backend may still be waking up. Please retry in a few seconds.`;
      }

      setAiGenGenerateErrors([message]);
      toast.error(message);
    } finally {
      setAiGenGenerating(false);
      aiGenGenerateInFlightRef.current = false;
    }
  };

  const uploadGeneratedAiMcq = async () => {
    if (!authToken) return;
    if (aiGenUploadInFlightRef.current || aiGenUploading) return;
    if (!aiGenGenerated) {
      toast.error('Generate an AI MCQ first.');
      return;
    }

    const hierarchyContext = resolveAiGenHierarchyContext(true);
    if (!hierarchyContext) return;

    const normalizedOptions = (aiGenGenerated.options || []).map((item) => String(item || '').trim()).filter(Boolean);
    if (normalizedOptions.length < 4) {
      toast.error('Generated MCQ must contain 4 options (A-D).');
      return;
    }

    aiGenUploadInFlightRef.current = true;
    setAiGenUploading(true);

    try {
      const optionMedia = normalizedOptions.slice(0, 4).map((text, idx) => ({
        key: String.fromCharCode(65 + idx),
        text,
        image: null,
      }));
      const resolvedAnswer = resolveAnswerKeyFromInput(optionMedia, aiGenGenerated.answer) || 'A';

      const payload = {
        question: aiGenGenerated.question,
        subject: hierarchyContext.subject,
        part: hierarchyContext.part,
        chapter: hierarchyContext.chapter,
        section: hierarchyContext.section,
        topic: hierarchyContext.topic,
        options: normalizedOptions.slice(0, 4),
        optionMedia,
        answer: resolvedAnswer,
        tip: aiGenGenerated.explanation,
        explanationText: aiGenGenerated.explanation,
        difficulty: aiGenGenerated.difficulty,
      };

      const result = await apiRequest<{ mcq?: AdminMCQ }>('/api/admin/mcqs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, authToken);

      if (!result?.mcq?.id) {
        throw new Error('Generated MCQ could not be saved.');
      }

      setMcqs((previous) => [result.mcq!, ...previous.filter((item) => item.id !== result.mcq!.id)]);
      setAiGenGenerated(null);
      toast.success('Generated MCQ uploaded successfully.');

      void apiRequest<{ structure: AdminMcqBankStructureItem[] }>('/api/admin/mcq-bank/structure', {}, authToken)
        .then((structurePayload) => setMcqStructure(structurePayload.structure || []))
        .catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload generated MCQ.');
    } finally {
      setAiGenUploading(false);
      aiGenUploadInFlightRef.current = false;
    }
  };

  const uploadBulkMcqs = async () => {
    if (!authToken) return;

    if (!bulkParsed.length) {
      toast.error('Analyze content first, then save parsed MCQs.');
      return;
    }

    if (bulkParsed.length > 15) {
      toast.error('You can upload at most 15 questions at once.');
      return;
    }

    const hierarchyContext = resolveDocumentHierarchyContext(true);
    if (!hierarchyContext) return;

    try {
      setBulkUploading(true);

      const mcqsPayload = bulkParsed.map((item) => {
        const subjectCandidate = String(item.subject || '').trim().toLowerCase();
        const subject = subjectCandidate || String(hierarchyContext.subject || '').trim().toLowerCase();
        const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(subject);
        const requiresPartSelection = !isFlatTopicSubject && isPartSelectionRequiredSubject(subject);
        const partCandidate = String(item.part || '').trim().toLowerCase();
        const part = isFlatTopicSubject
          ? ''
          : (requiresPartSelection ? (partCandidate || String(hierarchyContext.part || '').trim().toLowerCase()) : '');
        const chapter = isFlatTopicSubject
          ? ''
          : String(item.chapter || hierarchyContext.chapter || '').trim();
        const section = String(item.section || item.topic || hierarchyContext.section || '').trim();
        const topic = String(item.topic || section || hierarchyContext.topic || '').trim();

        const optionMedia = (item.options || []).map((text, idx) => ({
          key: String.fromCharCode(65 + idx),
          text: String(text || ''),
          image: parsedDataUrlToImage(item.optionImageDataUrls?.[idx], `option-${idx + 1}-image`),
        }));

        return {
          subject,
          part,
          chapter,
          section,
          topic: topic || section,
          question: item.question,
          questionImageUrl: item.questionImageUrl,
          questionImage: parsedDataUrlToImage(item.questionImageDataUrl, 'question-image'),
          options: item.options,
          optionMedia,
          answer: item.answer,
          tip: item.tip,
          explanationText: item.tip,
          explanationImage: parsedDataUrlToImage(item.explanationImageDataUrl, 'explanation-image'),
          shortTrickText: String(item.shortTrick || '').trim(),
          shortTrickImage: null,
          difficulty: item.difficulty,
        };
      });

      const uploadResults = await Promise.allSettled(
        mcqsPayload.map((payload) => apiRequest<{ mcq?: AdminMCQ }>('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken)),
      );

      const createdMcqs: AdminMCQ[] = [];
      const errors: string[] = [];

      uploadResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const created = result.value?.mcq;
          if (created?.id) {
            createdMcqs.push(created);
          } else {
            errors.push(`MCQ #${index + 1}: API did not return saved MCQ id.`);
          }
          return;
        }

        const reason = result.reason instanceof Error ? result.reason.message : 'Could not save.';
        errors.push(`MCQ #${index + 1}: ${reason}`);
      });

      const createdCount = createdMcqs.length;
      const failedCount = mcqsPayload.length - createdCount;

      console.info('Admin bulk upload completed', {
        attemptedCount: mcqsPayload.length,
        createdCount,
        failedCount,
      });

      if (!createdCount) {
        throw new Error(errors[0] || 'Bulk upload failed.');
      }

      setMcqs((previous) => [
        ...createdMcqs,
        ...previous.filter((item) => !createdMcqs.some((created) => created.id === item.id)),
      ]);

      if (failedCount > 0) {
        toast.warning(`Uploaded ${createdCount} MCQ(s). ${failedCount} failed.`);
      } else {
        toast.success(`${createdCount} MCQ(s) uploaded successfully.`);
      }

      setBulkInput('');
      setBulkFile(null);
      setBulkParsed([]);
      setBulkParseErrors(errors);
      setShowParsedPreview(false);
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk upload failed.');
    } finally {
      setBulkUploading(false);
    }
  };

  const uploadAllMCQs = async () => {
    await uploadBulkMcqs();
  };

  const updateParsedMcq = (index: number, updater: (item: ParsedBulkMcq) => ParsedBulkMcq) => {
    setBulkParsed((previous) => previous.map((item, idx) => (idx === index ? updater(item) : item)));
  };

  const applyDifficultyToAllParsedMcqs = () => {
    if (!bulkAnalysisReady || !bulkParsed.length) {
      toast.error('Run Analyse MCQs successfully first, then apply difficulty.');
      return;
    }

    setBulkParsed((previous) => previous.map((item) => ({
      ...item,
      difficulty: bulkApplyDifficultyLevel,
    })));
    toast.success(`Applied ${bulkApplyDifficultyLevel} to ${bulkParsed.length} parsed MCQ(s).`);
  };

  const openMcqTestPreview = (payload: AdminMcqPreviewPayload) => {
    try {
      localStorage.setItem(ADMIN_MCQ_TEST_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      toast.error('Could not prepare preview data. Please try again.');
      return;
    }

    const previewWindow = window.open('/exam-interface?preview=admin-mcq-upload', '_blank', 'noopener,noreferrer');
    if (!previewWindow) {
      toast.error('Preview window was blocked. Allow pop-ups and try again.');
      return;
    }
    previewWindow.focus();
  };

  const openManualMcqPreview = () => {
    const normalizedSubject = String(form.subject || 'mathematics').trim().toLowerCase();
    const topic = String(form.topic || form.section || 'Manual MCQ Preview').trim() || 'Manual MCQ Preview';
    const question = String(form.question || '').trim();
    const questionImage = form.questionImage || null;

    const optionMedia = form.optionMedia
      .map((option, index) => ({
        key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
        text: String(option.text || ''),
        image: option.image || null,
      }))
      .slice(0, 8);

    const hasQuestionContent = Boolean(question || questionImage?.dataUrl);
    const hasOptionContent = optionMedia.some((option) => option.text || option.image?.dataUrl);

    if (!hasQuestionContent || !hasOptionContent) {
      toast.error('Add at least question and one option before opening preview.');
      return;
    }

    openMcqTestPreview({
      source: 'admin-mcq-upload-preview',
      createdAt: Date.now(),
      topic,
      durationMinutes: 60,
      questions: [
        {
          id: 'manual-preview-1',
          subject: normalizedSubject,
          topic,
          question,
          options: optionMedia.map((option) => option.text || `[${option.key}]`),
          optionMedia,
          questionImage,
          difficulty: form.difficulty === 'Easy' || form.difficulty === 'Hard' ? form.difficulty : 'Medium',
        },
      ],
    });
  };

  const openAiGeneratedMcqPreview = () => {
    if (!aiGenGenerated) {
      toast.error('Generate an AI MCQ first, then open preview.');
      return;
    }

    const hierarchyContext = resolveAiGenHierarchyContext(true);
    if (!hierarchyContext) return;

    const optionMedia = (aiGenGenerated.options || []).slice(0, 4).map((text, index) => ({
      key: String.fromCharCode(65 + index),
      text: String(text || ''),
      image: null,
    }));

    const hasQuestionContent = Boolean(String(aiGenGenerated.question || '').trim());
    const hasOptionContent = optionMedia.some((option) => option.text);
    if (!hasQuestionContent || !hasOptionContent) {
      toast.error('Add question and options before opening preview.');
      return;
    }

    const answerKey = resolveAnswerKeyFromInput(optionMedia, aiGenGenerated.answer);
    if (!answerKey) {
      toast.error('Choose a valid correct answer before opening preview.');
      return;
    }

    openMcqTestPreview({
      source: 'admin-mcq-upload-preview',
      createdAt: Date.now(),
      topic: hierarchyContext.topic || hierarchyContext.section || 'AI Generated MCQ Preview',
      durationMinutes: 60,
      questions: [
        {
          id: 'ai-generated-preview-1',
          subject: hierarchyContext.subject,
          topic: hierarchyContext.topic || hierarchyContext.section || 'AI Generated MCQ Preview',
          question: String(aiGenGenerated.question || ''),
          options: optionMedia.map((option) => option.text || `[${option.key}]`),
          optionMedia,
          questionImage: null,
          answerKey,
          difficulty: aiGenGenerated.difficulty === 'Easy' || aiGenGenerated.difficulty === 'Hard' ? aiGenGenerated.difficulty : 'Medium',
        },
      ],
    });
  };

  const openDocumentMcqPreview = () => {
    if (!bulkParsed.length) {
      toast.error('Parse MCQs first, then open preview.');
      return;
    }

    const topic = String(form.topic || form.section || 'Document MCQ Preview').trim() || 'Document MCQ Preview';

    const questions: AdminMcqPreviewQuestion[] = bulkParsed.map((item, mcqIndex) => {
      const options = Array.isArray(item.options) ? item.options.slice(0, 8).map((option) => String(option || '')) : [];
      const optionMedia = options.map((text, optionIndex) => ({
        key: String.fromCharCode(65 + optionIndex),
        text,
        image: parsedDataUrlToImage(item.optionImageDataUrls?.[optionIndex], `preview-option-${mcqIndex + 1}-${optionIndex + 1}`),
      }));

      const difficulty = String(item.difficulty || 'Medium').trim();

      return {
        id: `document-preview-${mcqIndex + 1}`,
        subject: String(item.subject || form.subject || 'mathematics').trim().toLowerCase(),
        topic: String(item.topic || item.section || topic).trim() || topic,
        question: String(item.question || ''),
        options: optionMedia.map((option) => option.text || `[${option.key}]`),
        optionMedia,
        questionImage: parsedDataUrlToImage(item.questionImageDataUrl, `preview-question-${mcqIndex + 1}`),
        difficulty: difficulty === 'Easy' || difficulty === 'Hard' ? difficulty : 'Medium',
      };
    });

    const hasRenderableQuestion = questions.some((item) => item.question || item.questionImage?.dataUrl);
    if (!hasRenderableQuestion) {
      toast.error('Parsed MCQs are empty. Add content before preview.');
      return;
    }

    openMcqTestPreview({
      source: 'admin-mcq-upload-preview',
      createdAt: Date.now(),
      topic,
      durationMinutes: 60,
      questions,
    });
  };

  const openBankMcqPreview = (draft: EditableBankMcq) => {
    const topic = String(draft.topic || draft.section || 'MCQ Preview').trim() || 'MCQ Preview';
    const optionMedia = (draft.optionMedia || []).map((option, index) => ({
      key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
      text: String(option.text || ''),
      image: option.image || null,
    }));

    const hasQuestionContent = Boolean(String(draft.question || '').trim() || draft.questionImage?.dataUrl);
    const hasOptionContent = optionMedia.some((option) => option.text || option.image?.dataUrl);
    if (!hasQuestionContent || !hasOptionContent) {
      toast.error('Add question and options before opening preview.');
      return;
    }

    const answerKey = resolveAnswerKeyFromInput(optionMedia, String(draft.answer || ''));
    if (!answerKey) {
      toast.error('Choose a valid correct answer before opening preview.');
      return;
    }

    openMcqTestPreview({
      source: 'admin-mcq-bank-preview',
      createdAt: Date.now(),
      topic,
      durationMinutes: 60,
      questions: [
        {
          id: String(draft.id || 'bank-preview-1'),
          subject: String(draft.subject || 'mathematics').trim().toLowerCase(),
          topic,
          question: String(draft.question || ''),
          options: optionMedia.map((option) => option.text || `[${option.key}]`),
          optionMedia,
          questionImage: draft.questionImage || null,
          answerKey,
          difficulty: draft.difficulty === 'Easy' || draft.difficulty === 'Hard' ? draft.difficulty : 'Medium',
        },
      ],
    });
  };

  const updateParsedOption = (mcqIndex: number, optionIndex: number, value: string) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      options[optionIndex] = value;
      return { ...item, options };
    });
  };

  const addParsedOption = (mcqIndex: number) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      if (options.length >= 5) return item;
      options.push('');
      return { ...item, options };
    });
  };

  const removeParsedOption = (mcqIndex: number, optionIndex: number) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      if (options.length <= 2) return item;
      options.splice(optionIndex, 1);
      const optionImageDataUrls = Array.isArray(item.optionImageDataUrls) ? [...item.optionImageDataUrls] : [];
      if (optionImageDataUrls.length > optionIndex) {
        optionImageDataUrls.splice(optionIndex, 1);
      }
      return {
        ...item,
        options,
        optionImageDataUrls,
      };
    });
  };

  const removeParsedMcq = (mcqIndex: number) => {
    setBulkParsed((previous) => previous.filter((_, idx) => idx !== mcqIndex));
  };

  const deleteMcq = async (mcqId: string) => {
    if (!authToken) return;
    if (!window.confirm('Delete this MCQ from the bank?')) return;

    try {
      await apiRequest(`/api/admin/mcqs/${mcqId}`, { method: 'DELETE' }, authToken);
      toast.success('MCQ removed.');
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      } else {
        await loadAdminData(authToken);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete MCQ.');
    }
  };

  const updateBankEditDraft = (mcqId: string, updater: (draft: EditableBankMcq) => EditableBankMcq) => {
    setBankEditDrafts((previous) => {
      const current = previous[mcqId];
      if (!current) return previous;
      return {
        ...previous,
        [mcqId]: updater(current),
      };
    });
  };

  const saveBankMcqChanges = async (mcqId: string) => {
    if (!authToken) return;
    if (!selectedHierarchy) {
      toast.error('Select a section/topic first.');
      return;
    }

    const draft = bankEditDrafts[mcqId];
    if (!draft) {
      toast.error('Could not find editable MCQ data.');
      return;
    }

    const normalizedOptionMedia = draft.optionMedia
      .map((option, index) => ({
        key: String(option.key || String.fromCharCode(65 + index)).trim().toUpperCase(),
        text: String(option.text || '').trim(),
        image: option.image || null,
      }))
      .filter((option) => option.text || option.image);

    if (!normalizedOptionMedia.length || normalizedOptionMedia.length < 4) {
      toast.error('At least options A, B, C, and D are required.');
      return;
    }

    const requiredKeys = ['A', 'B', 'C', 'D'];
    const missingRequired = requiredKeys.find((key, idx) => {
      const option = normalizedOptionMedia[idx];
      if (!option) return true;
      return !option.text && !option.image;
    });
    if (missingRequired) {
      toast.error('Options A, B, C, and D are required.');
      return;
    }

    if (draft.questionType === 'text' && !String(draft.question || '').trim()) {
      toast.error('Question text is required.');
      return;
    }

    if (draft.questionType === 'image' && !draft.questionImage) {
      toast.error('Question image is required when question type is image.');
      return;
    }

    const answerKey = resolveAnswerKeyFromInput(normalizedOptionMedia, draft.answer);
    if (!answerKey) {
      toast.error('Choose a valid correct answer (A-E, number, or exact option text).');
      return;
    }

    const sectionContext = selectedHierarchy.kind === 'section'
      ? {
        subject: selectedHierarchy.subject,
        part: selectedHierarchy.part,
        chapter: selectedHierarchy.chapterTitle,
        section: selectedHierarchy.sectionTitle,
      }
      : {
        subject: selectedHierarchy.subject,
        part: '',
        chapter: '',
        section: selectedHierarchy.sectionTitle,
      };

    const payload = {
      question_type: draft.questionType,
      question_text: String(draft.question || '').trim(),
      question_image: draft.questionImage || null,
      question: String(draft.question || '').trim(),
      option_a: normalizedOptionMedia[0]?.text || '[A]',
      option_b: normalizedOptionMedia[1]?.text || '[B]',
      option_c: normalizedOptionMedia[2]?.text || '[C]',
      option_d: normalizedOptionMedia[3]?.text || '[D]',
      correct_answer: answerKey,
      explanation: String(draft.explanationText || '').trim(),
      subject: sectionContext.subject,
      part: sectionContext.part,
      chapter: sectionContext.chapter,
      section: sectionContext.section,
      topic: String(draft.topic || sectionContext.section || '').trim(),
      subject_id: sectionContext.subject,
      chapter_id: String(sectionContext.chapter || '').trim(),
      section_id: String(sectionContext.section || '').trim(),
      topic_id: String(draft.topic || sectionContext.section || '').trim(),
      questionImage: draft.questionImage || null,
      options: normalizedOptionMedia.map((option) => option.text || `[${option.key}]`),
      optionMedia: normalizedOptionMedia,
      answer: answerKey,
      answerKey,
      tip: String(draft.explanationText || '').trim(),
      explanationText: String(draft.explanationText || '').trim(),
      explanationImage: draft.explanationImage || null,
      shortTrickText: String(draft.shortTrickText || '').trim(),
      shortTrickImage: draft.shortTrickImage || null,
      difficulty: draft.difficulty,
    };

    try {
      setBankSavingIds((previous) => ({ ...previous, [mcqId]: true }));
      const result = await apiRequest<{ mcq?: AdminMCQ }>(`/api/admin/mcqs/${mcqId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }, authToken);

      if (result?.mcq?.id) {
        setMcqs((previous) => previous.map((item) => (item.id === result.mcq!.id ? result.mcq! : item)));
        setBankEditDrafts((previous) => ({
          ...previous,
          [mcqId]: createEditableBankMcq(result.mcq!),
        }));
      }

      toast.success('MCQ updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update this MCQ.');
    } finally {
      setBankSavingIds((previous) => ({ ...previous, [mcqId]: false }));
    }
  };

  const bulkDeleteMcqs = async () => {
    if (!authToken) return;

    const subject = String(bulkDeleteSubject || '').trim().toLowerCase();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(subject);
    const requiresPartSelection = isPartSelectionRequiredSubject(subject);
    const part = String(bulkDeletePart || '').trim().toLowerCase();
    const chapter = String(bulkDeleteChapter || '').trim();
    const sectionOrTopic = String(bulkDeleteSectionOrTopic || '').trim();

    if (bulkDeleteMode === 'subject' && !subject) {
      toast.error('Select or type a subject for subject-level deletion.');
      return;
    }

    if (bulkDeleteMode === 'chapter' && !isFlatTopicSubject && (!subject || !chapter)) {
      toast.error('Subject and chapter are required for chapter-level deletion.');
      return;
    }

    if ((bulkDeleteMode === 'chapter' || bulkDeleteMode === 'section-topic') && !isFlatTopicSubject && requiresPartSelection && !part) {
      toast.error('Select Part 1 or Part 2 before deleting for this subject.');
      return;
    }

    if (bulkDeleteMode === 'section-topic' && (!subject || !sectionOrTopic)) {
      toast.error('Subject and section/topic are required for section/topic deletion.');
      return;
    }

    const summary =
      bulkDeleteMode === 'all'
        ? 'all MCQs in the application'
        : bulkDeleteMode === 'subject'
          ? `all MCQs in subject "${subject}"`
          : bulkDeleteMode === 'chapter' && !isFlatTopicSubject
            ? `all MCQs in chapter "${chapter}"${part ? ` (${part.toUpperCase()})` : ''} under subject "${subject}"`
            : `all MCQs in section/topic "${sectionOrTopic}"${chapter ? ` under chapter "${chapter}"` : ''} and subject "${subject}"`;

    const confirmed = window.confirm(`Are you sure you want to permanently delete ${summary}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const payload = await apiRequest<{ ok: boolean; removed: number }>(
        '/api/admin/mcqs/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            mode: bulkDeleteMode === 'chapter' && isFlatTopicSubject ? 'section-topic' : bulkDeleteMode,
            subject,
            part: isFlatTopicSubject ? '' : (requiresPartSelection ? part : ''),
            chapter: isFlatTopicSubject ? '' : chapter,
            sectionOrTopic,
          }),
        },
        authToken,
      );

      toast.success(`${payload.removed || 0} MCQ(s) deleted.`);
      await loadAdminData(authToken);
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not bulk delete MCQs.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const updateUserSubscription = async (userId: string, planId: string, status: string) => {
    if (!authToken) return;
    try {
      await apiRequest(
        `/api/admin/subscriptions/${userId}/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            planId,
            status,
            paymentReference: `admin-${Date.now()}`,
          }),
        },
        authToken,
      );
      toast.success('Subscription updated successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update subscription.');
    }
  };

  const assignSubscriptionByEmail = async () => {
    if (!authToken) return;

    if (!assignPlanForm.email.trim() || !assignPlanForm.planId.trim()) {
      toast.error('User email and plan are required.');
      return;
    }

    try {
      setIsAssigningPlan(true);
      await apiRequest('/api/admin/subscriptions/assign', {
        method: 'POST',
        body: JSON.stringify({
          email: assignPlanForm.email.trim(),
          planId: assignPlanForm.planId,
          status: assignPlanForm.status,
          paymentReference: `admin-${Date.now()}`,
        }),
      }, authToken);

      toast.success('Subscription assigned successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign subscription.');
    } finally {
      setIsAssigningPlan(false);
    }
  };

  const resetPracticeForm = () => {
    setPracticeForm(emptyPracticeForm());
    setPracticeQuestionUpload(null);
    setPracticeSolutionUpload(null);
  };

  const savePracticeQuestion = async () => {
    if (!authToken) return;

    if (!practiceForm.subject.trim()) {
      toast.error('Subject is required.');
      return;
    }

    if (practiceQuestionUpload && !isSupportedPracticeFile(practiceQuestionUpload)) {
      toast.error('Question file must be JPG, PNG, PDF, DOC, or DOCX.');
      return;
    }

    if (practiceSolutionUpload && !isSupportedPracticeFile(practiceSolutionUpload)) {
      toast.error('Solution file must be JPG, PNG, PDF, DOC, or DOCX.');
      return;
    }

    if (practiceQuestionUpload && practiceQuestionUpload.size > PRACTICE_FILE_MAX_BYTES) {
      toast.error('Question file exceeds 8MB limit.');
      return;
    }

    if (practiceSolutionUpload && practiceSolutionUpload.size > PRACTICE_FILE_MAX_BYTES) {
      toast.error('Solution file exceeds 8MB limit.');
      return;
    }

    let questionFilePayload = practiceForm.questionFile || null;
    let solutionFilePayload = practiceForm.solutionFile || null;

    try {
      if (practiceQuestionUpload) {
        questionFilePayload = {
          name: practiceQuestionUpload.name,
          mimeType: practiceQuestionUpload.type || 'application/octet-stream',
          size: practiceQuestionUpload.size,
          dataUrl: await fileToDataUrl(practiceQuestionUpload),
        };
      }

      if (practiceSolutionUpload) {
        solutionFilePayload = {
          name: practiceSolutionUpload.name,
          mimeType: practiceSolutionUpload.type || 'application/octet-stream',
          size: practiceSolutionUpload.size,
          dataUrl: await fileToDataUrl(practiceSolutionUpload),
        };
      }
    } catch {
      toast.error('Could not read uploaded file. Please try again.');
      return;
    }

    if (!practiceForm.questionText.trim() && !questionFilePayload) {
      toast.error('Provide question text or upload a question file.');
      return;
    }

    if (!practiceForm.solutionText.trim() && !solutionFilePayload) {
      toast.error('Provide solution text or upload a solution file.');
      return;
    }

    const payload = {
      subject: practiceForm.subject.toLowerCase().trim(),
      difficulty: practiceForm.difficulty,
      questionText: practiceForm.questionText.trim(),
      questionFile: questionFilePayload,
      solutionText: practiceForm.solutionText.trim(),
      solutionFile: solutionFilePayload,
    };

    try {
      if (practiceForm.id) {
        await apiRequest(`/api/admin/practice-board/questions/${practiceForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('Practice board question updated.');
      } else {
        await apiRequest('/api/admin/practice-board/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('Practice board question added.');
      }

      resetPracticeForm();
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save practice board question.');
    }
  };

  const deletePracticeQuestion = async (questionId: string) => {
    if (!authToken) return;
    if (!window.confirm('Delete this practice board question?')) return;

    try {
      await apiRequest(`/api/admin/practice-board/questions/${questionId}`, { method: 'DELETE' }, authToken);
      toast.success('Practice board question removed.');
      if (practiceForm.id === questionId) {
        resetPracticeForm();
      }
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete practice board question.');
    }
  };

  const reviewQuestionSubmission = async (
    submissionId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!authToken) return;

    const notes = String(submissionReviewNotes[submissionId] || '').trim();
    const previousSubmission = questionSubmissions.find((item) => item.id === submissionId) || null;

    setQuestionSubmissions((prev) => prev.map((item) => {
      if (item.id !== submissionId) return item;
      const existingReasons = Array.isArray(item.moderation?.reasons) ? item.moderation?.reasons : [];
      return {
        ...item,
        status,
        reviewNotes: notes,
        reviewedAt: new Date().toISOString(),
        moderation: {
          ...item.moderation,
          result: status,
          reasons: existingReasons,
        },
      };
    }));
    setCollapsedReviewedSubmissionIds((prev) => ({ ...prev, [submissionId]: true }));

    try {
      await apiRequest(
        `/api/admin/question-submissions/${submissionId}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            reviewNotes: notes,
          }),
        },
        authToken,
      );
      toast.success('Submission review updated.');
      await loadAdminData(authToken);
    } catch (error) {
      if (previousSubmission) {
        setQuestionSubmissions((prev) => prev.map((item) => (item.id === submissionId ? previousSubmission : item)));
      }
      setCollapsedReviewedSubmissionIds((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, submissionId)) return prev;
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      toast.error(error instanceof Error ? error.message : 'Could not update submission review.');
    }
  };

  const saveContributionPolicy = async () => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ policy: AdminContributionPolicy }>(
        '/api/admin/question-submissions/policy',
        {
          method: 'PUT',
          body: JSON.stringify({
            maxSubmissionsPerDay: contributionPolicy.maxSubmissionsPerDay,
            maxFilesPerSubmission: contributionPolicy.maxFilesPerSubmission,
            maxFileSizeBytes: contributionPolicy.maxFileSizeBytes,
            blockDurationMinutes: contributionPolicy.blockDurationMinutes,
          }),
        },
        authToken,
      );
      setContributionPolicy(payload.policy);
      toast.success('Submission policy updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update policy.');
    }
  };

  const reviewCommunityReport = async (report: AdminCommunityReport, action: 'block' | 'dismiss') => {
    if (!authToken) return;

    const notes = String(communityReportNotes[report.id] || '').trim();
    const defaultViolator = String(report.moderation?.violatorUserId || report.reportedUserId || '').trim();

    try {
      await apiRequest(
        `/api/admin/community/reports/${report.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            notes,
            violatorUserId: defaultViolator,
          }),
        },
        authToken,
      );
      toast.success(action === 'block' ? 'User blocked from community.' : 'Report dismissed.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not review community report.');
    }
  };

  const handleSectionSelection = async (selection: {
    subject: SubjectKey;
    part: 'part1' | 'part2' | '';
    chapterTitle: string;
    sectionTitle: string;
  }) => {
    if (!authToken) return;

    const normalizedSelection: SelectedHierarchy = {
      kind: 'section',
      ...selection,
    };
    setSelectedHierarchy(normalizedSelection);
    setForm((prev) => ({
      ...prev,
      subject: selection.subject,
      part: selection.part,
      chapter: selection.chapterTitle,
      section: selection.sectionTitle,
      topic: `${selection.chapterTitle} - ${selection.sectionTitle}`,
    }));

    try {
      await loadSectionMcqs(authToken, normalizedSelection);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load section MCQs.');
    }
  };

  const handleFlatTopicSelection = async (selection: {
    tabKey: 'quantitative-mathematics' | 'design-aptitude';
    subject: 'quantitative-mathematics' | 'design-aptitude';
    topicTitle: string;
  }) => {
    if (!authToken) return;

    const normalizedSelection: SelectedHierarchy = {
      kind: 'flat-topic',
      subject: selection.subject,
      chapterTitle: '',
      sectionTitle: selection.topicTitle,
    };

    setSelectedHierarchy(normalizedSelection);
    setForm((prev) => ({
      ...prev,
      subject: selection.subject,
      part: '',
      chapter: '',
      section: selection.topicTitle,
      topic: selection.topicTitle,
    }));

    try {
      await loadSectionMcqs(authToken, normalizedSelection);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load topic MCQs.');
    }
  };

  if (!ready) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="flex min-h-screen items-center justify-center p-5">
          <button
            type="button"
            onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="fixed right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 shadow-md transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
            aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Card>
            <CardContent className="py-8">Loading admin panel...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <button
          type="button"
          onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          className="fixed right-4 top-4 z-50 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 shadow-md transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="flex min-h-screen items-center justify-center p-5">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>NET360 Admin Panel</CardTitle>
            <CardDescription>Separate management panel (outside student app)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <Button className="w-full" onClick={login} disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  if (isQuestionBankView) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />
        <div className="relative z-10 min-h-screen p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[1700px] space-y-4 sm:space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1>Question Bank Explorer</h1>
              <p className="text-sm text-muted-foreground">Browse all MCQs by Subject, Chapter, and Section/Topic.</p>
            </div>
            <Button variant="outline" onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}>
              Back to Admin Dashboard
            </Button>
          </header>

          <div className="grid gap-4 lg:grid-cols-[280px_320px_320px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {bankTree.map((subject) => (
                  <button
                    type="button"
                    key={subject.key}
                    onClick={() => {
                      setBankSubjectKey(subject.key);
                      setBankChapterKey('');
                      setBankSectionKey('');
                      setBankDifficultyFilter('');
                      setBankMcqs([]);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankSubjectKey === subject.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{subject.label}</span>
                      <Badge variant="outline">{subject.count}</Badge>
                    </div>
                  </button>
                ))}
                {!bankTree.length ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No subjects available yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Chapters</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {!activeBankSubject ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a subject first.
                  </div>
                ) : null}
                {(activeBankSubject?.chapters || []).map((chapter) => (
                  <button
                    type="button"
                    key={chapter.key}
                    onClick={() => {
                      setBankChapterKey(chapter.key);
                      setBankSectionKey('');
                      setBankDifficultyFilter('');
                      setBankMcqs([]);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankChapterKey === chapter.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{chapter.label}</span>
                      <Badge variant="outline">{chapter.count}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sections / Topics</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {!activeBankSubject ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a subject first.
                  </div>
                ) : null}
                {activeBankSubject && !activeBankChapter ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a chapter first.
                  </div>
                ) : null}
                {(activeBankChapter?.sections || []).map((section) => (
                  <button
                    type="button"
                    key={section.key}
                    onClick={() => setBankSectionKey(section.key)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankSectionKey === section.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{section.label}</span>
                      <Badge variant="outline">{section.count}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>MCQs</CardTitle>
                <CardDescription>
                  {activeBankSubject?.label || '-'} / {activeBankChapter?.label || '-'} / {activeBankSection?.label || '-'}
                </CardDescription>
              </CardHeader>
              <CardContent className="mcq-display-container space-y-3 max-h-[80vh] overflow-y-auto pr-2">
                {!activeBankSection ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Select a section/topic to load MCQs.
                  </div>
                ) : null}
                {activeBankSection ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-indigo-100 bg-indigo-50/40 p-2">
                    <span className="text-xs font-medium text-indigo-900">Difficulty:</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={bankDifficultyFilter === 'Easy' ? 'default' : 'outline'}
                      className="h-7"
                      onClick={() => setBankDifficultyFilter((prev) => (prev === 'Easy' ? '' : 'Easy'))}
                    >
                      Easy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bankDifficultyFilter === 'Medium' ? 'default' : 'outline'}
                      className="h-7"
                      onClick={() => setBankDifficultyFilter((prev) => (prev === 'Medium' ? '' : 'Medium'))}
                    >
                      Medium
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bankDifficultyFilter === 'Hard' ? 'default' : 'outline'}
                      className="h-7"
                      onClick={() => setBankDifficultyFilter((prev) => (prev === 'Hard' ? '' : 'Hard'))}
                    >
                      Hard
                    </Button>
                    {bankDifficultyFilter ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setBankDifficultyFilter('')}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                {bankLoading ? <p className="text-sm text-muted-foreground">Loading MCQs...</p> : null}
                {!bankLoading && activeBankSection && !filteredBankMcqs.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    {bankDifficultyFilter
                      ? `No ${bankDifficultyFilter} MCQs found for this section/topic.`
                      : 'No MCQs found for this section/topic.'}
                  </div>
                ) : null}
                {filteredBankMcqs.map((item, idx) => {
                  const questionImageSrc = normalizeMcqImageSrc(item.questionImage?.dataUrl || item.questionImageUrl);
                  const optionMedia = Array.isArray(item.optionMedia) && item.optionMedia.length
                    ? item.optionMedia
                    : (Array.isArray(item.options) ? item.options : []).map((text, optionIdx) => ({
                      key: String.fromCharCode(65 + optionIdx),
                      text: String(text || ''),
                      image: null,
                    }));
                  const explanationText = String(item.explanationText || item.tip || '').trim();
                  const explanationImageSrc = normalizeMcqImageSrc(item.explanationImage?.dataUrl);

                  return (
                    <div key={item.id} className="rounded-md border border-[#2b5f9f] bg-[#eef4fb] p-2.5 text-sm text-[#0d2c5a]">
                      <div className="mb-2 border-b border-[#2b5f9f] bg-[#d6e5f4] px-2 py-1 text-sm">
                        Question No : <span className="text-blue-700">{idx + 1} of {filteredBankMcqs.length}</span>
                      </div>

                      <section className="mb-2">
                        <p className="mb-2 font-semibold text-black">Question</p>
                        <div className="question-content rounded border border-[#1e3f6e] bg-white p-2.5 text-sm text-black sm:text-base">
                          <McqMathText value={String(item.question || '')} asBlock className="whitespace-pre-wrap" />
                          {questionImageSrc ? (
                            <img
                              src={questionImageSrc}
                              alt={`MCQ question ${idx + 1}`}
                              className="mcq-image mt-2 max-h-60 w-full"
                            />
                          ) : null}
                        </div>
                      </section>

                      <section className="mb-2 border-y border-[#2b5f9f] bg-[#a9c6df] px-2 py-1 text-sm">
                        Answer ( <span className="text-blue-700">Please select your correct option</span> )
                      </section>

                      <section className="space-y-2 border-b border-[#2b5f9f] bg-[#d6dbe2] p-2">
                        {optionMedia.map((option, optionIdx) => {
                          const optionKey = String(option.key || String.fromCharCode(65 + optionIdx)).toUpperCase();
                          const optionImageSrc = normalizeMcqImageSrc(option.image?.dataUrl);
                          return (
                            <div key={`${item.id}-opt-${optionIdx}`} className="option-content rounded border border-[#1e3f6e] bg-white px-2 py-2 text-sm text-black sm:text-base">
                              <p className="font-medium text-slate-700">{optionKey}.</p>
                              <McqMathText value={String(option.text || '')} className="whitespace-pre-wrap" />
                              {optionImageSrc ? (
                                <img
                                  src={optionImageSrc}
                                  alt={`Option ${optionKey} image`}
                                  className="option-image mt-2 max-h-40 w-full"
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </section>

                      <div className="mt-2 space-y-1 px-1 text-sm">
                        <p>Answer: <span className="font-medium">{item.answer}</span></p>
                        {explanationText || explanationImageSrc ? (
                          <div className="explanation-content mt-2 rounded border border-indigo-100 bg-indigo-50/40 p-2">
                            <p className="text-xs font-semibold text-indigo-900 sm:text-sm">Explanation</p>
                            <div className="mt-1 h-px w-full bg-indigo-200" />
                            {explanationText ? (
                              <p className="mt-2 whitespace-pre-wrap text-slate-700"><McqMathText value={explanationText} /></p>
                            ) : null}
                            {explanationImageSrc ? (
                              <img
                                src={explanationImageSrc}
                                alt={`Explanation ${idx + 1}`}
                                className="mcq-image mt-2 max-h-40 w-full"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (isPracticeBoardBankView) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />
        <div className="relative z-10 min-h-screen p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[1700px] space-y-4 sm:space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1>Practice Board Question Bank</h1>
              <p className="text-sm text-muted-foreground">Browse conceptual questions by subject and open attached files directly.</p>
            </div>
            <Button variant="outline" onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}>
              Back to Admin Dashboard
            </Button>
          </header>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[72vh] space-y-2 overflow-auto">
                {practiceQuestionsBySubject.map((entry) => (
                  <button
                    type="button"
                    key={entry.subject}
                    onClick={() => setPracticeBankSubjectKey(entry.subject)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activePracticeBankSubject?.subject === entry.subject ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{entry.subject}</span>
                      <Badge variant="outline">{entry.questions.length}</Badge>
                    </div>
                  </button>
                ))}
                {!practiceQuestionsBySubject.length ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No practice board questions found.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Questions</CardTitle>
                <CardDescription>
                  {activePracticeBankSubject?.subject || 'Select a subject'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[72vh] overflow-auto">
                <Input
                  placeholder="Search by text, difficulty, or file name..."
                  value={practiceQuery}
                  onChange={(e) => setPracticeQuery(e.target.value)}
                />

                {practiceBankVisibleQuestions.map((item, idx) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm space-y-2">
                    <p className="font-medium">Q{idx + 1}. {item.questionText || '(File-based question)'}</p>
                    <p className="text-xs text-muted-foreground">Difficulty: {item.difficulty || 'Medium'}</p>

                    {item.questionFile ? (
                      <div className="rounded-md bg-slate-50 p-2 text-xs space-y-1">
                        <p>Question file: {item.questionFile.name}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openPracticeFile(item.questionFile)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPracticeFile(item.questionFile)}>Download</Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-md bg-emerald-50/60 p-2">
                      <p className="text-xs uppercase tracking-wide text-emerald-700">Solution</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{item.solutionText || '(File-only solution)'}</p>
                    </div>

                    {item.solutionFile ? (
                      <div className="rounded-md bg-slate-50 p-2 text-xs space-y-1">
                        <p>Solution file: {item.solutionFile.name}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openPracticeFile(item.solutionFile)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPracticeFile(item.solutionFile)}>Download</Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!practiceBankVisibleQuestions.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No questions found for this subject.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />

      <button
        type="button"
        onClick={toggleSidebar}
        className="admin-mobile-sidebar-toggle inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300/75 bg-white/90 text-slate-700 shadow-lg backdrop-blur-md transition active:scale-[0.98] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 dark:border-white/20 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-900"
        aria-label={isMobileSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-controls="admin-sidebar"
        aria-expanded={isMobileSidebarOpen}
      >
        {isMobileSidebarOpen ? <X className="h-4.5 w-4.5" /> : <PanelLeftOpen className="h-4.5 w-4.5" />}
      </button>

      <div
        className={`fixed inset-0 z-30 bg-slate-900/45 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isMobileSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <aside
        id="admin-sidebar"
        className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-300/70 bg-white/80 px-3 py-4 shadow-[0_16px_45px_rgba(15,23,42,0.15)] backdrop-blur-xl transition-all duration-300 ease-out dark:border-white/10 dark:bg-slate-950/60 dark:shadow-[0_20px_45px_rgba(3,8,30,0.55)] ${isSidebarExpanded ? 'w-72' : 'w-20'} ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`mb-5 flex items-center ${isSidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          {isSidebarExpanded ? (
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">NET360 Admin</h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">Control center</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20 lg:inline-flex"
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarExpanded ? <PanelLeftClose className="h-4.5 w-4.5" /> : <PanelLeftOpen className="h-4.5 w-4.5" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {ADMIN_SECTION_META.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.section;
            return (
              <button
                type="button"
                key={item.section}
                onClick={() => navigateToSection(item.section)}
                title={!isSidebarExpanded ? item.label : undefined}
                className={`admin-nav-item group flex h-11 w-full items-center rounded-xl border px-3 text-sm transition-all duration-200 ${isSidebarExpanded ? 'justify-start gap-2.5' : 'justify-center'} ${isActive
                  ? 'border-cyan-400/40 bg-gradient-to-r from-cyan-500/25 to-indigo-500/25 text-slate-900 shadow-[0_8px_25px_rgba(14,116,144,0.22)] dark:text-white'
                  : 'border-slate-300/70 bg-white/65 text-slate-700 hover:border-cyan-300/45 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'}
                `}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-500 dark:text-slate-300'}`} />
                {isSidebarExpanded ? <span className="truncate">{item.label}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className={`admin-main relative z-10 px-3 py-4 transition-[margin-left] duration-300 sm:px-5 lg:px-8 lg:py-6 ${isSidebarExpanded ? 'lg:ml-72' : 'lg:ml-20'}`}>
        <div className="admin-content mx-auto w-full max-w-[1700px] space-y-5">
          <header className="admin-header-panel rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-white/15 dark:bg-white/10 dark:shadow-[0_20px_50px_rgba(8,20,46,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                  aria-hidden="true"
                >
                  <img
                    src={ADMIN_BRAND_LOGO_SRC}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">NET360 Admin Management</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Manage users and MCQs from this separate panel</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300/70 bg-white/80 px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                  aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {themeMode === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                  <span className="hidden text-xs sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <Button variant="outline" className="border-slate-300/70 bg-white/70 text-slate-800 hover:bg-white dark:border-white/25 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20" onClick={logout}>Logout</Button>
              </div>
            </div>
          </header>

          {adminLoadError ? (
            <Card className="border-rose-300 bg-rose-50/90 dark:border-rose-400/40 dark:bg-rose-500/10">
              <CardContent className="py-3 text-sm text-rose-800 dark:text-rose-200">
                Admin data failed to load from backend: {adminLoadError}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === 'dashboard' ? (
            <>
              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-cyan-200"><Gauge className="h-4 w-4" />System Overview</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric title="Registered Users" value={String(overview?.usersCount || 0)} icon={Users} tone="from-cyan-500/30 to-blue-500/20" />
                  <Metric title="Question Bank" value={String(overview?.mcqCount || 0)} icon={Boxes} tone="from-violet-500/35 to-fuchsia-500/20" onClick={openQuestionBankWindow} />
                  <Metric title="Practice Board Question Bank" value={String(practiceQuestions.length)} icon={BookCheck} tone="from-indigo-500/35 to-cyan-500/20" onClick={openPracticeBoardBankWindow} />
                  <Metric title="Attempts" value={String(overview?.attemptsCount || 0)} icon={BarChart3} tone="from-pink-500/35 to-rose-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-violet-200"><UserCog className="h-4 w-4" />User Management</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Average Score" value={`${overview?.averageScore || 0}%`} icon={Activity} tone="from-blue-500/30 to-cyan-500/20" />
                  <Metric title="Pending Signup Requests" value={String(overview?.pendingSignupRequests || 0)} icon={ClipboardList} tone="from-amber-500/30 to-orange-500/20" />
                  <Metric title="Approved Requests" value={String(signupRequests.filter((item) => item.status === 'approved').length)} icon={FileCheck2} tone="from-emerald-500/30 to-teal-500/20" />
                  <Metric title="Completed Signups" value={String(signupRequests.filter((item) => item.status === 'completed').length)} icon={Users} tone="from-violet-500/25 to-blue-500/20" />
                  <Metric title="Recovery Requests" value={String(overview?.recoveryRequestCount || 0)} icon={ShieldAlert} tone="from-pink-500/25 to-red-500/20" />
                  <Metric title="Tracked Users" value={String(subscriptionOverview?.totalUsers || 0)} icon={UserCog} tone="from-cyan-500/25 to-indigo-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-fuchsia-200"><FileQuestion className="h-4 w-4" />Content Management</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Pending User Submissions" value={String(overview?.pendingQuestionSubmissions || 0)} icon={ClipboardList} tone="from-amber-500/30 to-yellow-500/20" />
                  <Metric title="Pending Premium Requests" value={String(overview?.pendingPremiumRequests || 0)} icon={Sparkles} tone="from-fuchsia-500/30 to-violet-500/20" />
                  <Metric title="Approved Submissions" value={String(questionSubmissions.filter((item) => item.status === 'approved').length)} icon={FileCheck2} tone="from-emerald-500/30 to-cyan-500/20" />
                  <Metric title="Rejected Submissions" value={String(questionSubmissions.filter((item) => item.status === 'rejected').length)} icon={ShieldAlert} tone="from-rose-500/30 to-red-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-teal-200"><CreditCard className="h-4 w-4" />Analytics</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Active Subscriptions" value={String(subscriptionOverview?.activeUsers || 0)} icon={CreditCard} tone="from-emerald-500/30 to-cyan-500/20" />
                  <Metric title="Expired/Inactive" value={String(subscriptionOverview?.expiredUsers || 0)} icon={Activity} tone="from-rose-500/30 to-orange-500/20" />
                </div>
              </section>

              <Card className="rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_45px_rgba(6,10,40,0.45)] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle>Password Recovery Snapshot</CardTitle>
                  <CardDescription className="text-slate-300">Quick delivery status overview for recent recovery activity.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-500 text-white">sent: {overview?.recoveryStatusCounts?.sent || 0}</Badge>
                  <Badge className="bg-amber-500 text-white">partial: {overview?.recoveryStatusCounts?.partial || 0}</Badge>
                  <Badge className="bg-rose-500 text-white">failed: {overview?.recoveryStatusCounts?.failed || 0}</Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">not_found: {overview?.recoveryStatusCounts?.not_found || 0}</Badge>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_45px_rgba(6,10,40,0.45)] backdrop-blur-xl">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>System Status</CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 border-white/25 bg-white/10 text-slate-100 hover:bg-white/20"
                      onClick={() => void refreshSystemStatus()}
                      disabled={isRefreshingSystemStatus}
                    >
                      {isRefreshingSystemStatus ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      {isRefreshingSystemStatus ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                  <CardDescription className="text-slate-300">Live backend connectivity check for AI mentor services.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Badge className={systemStatus?.openai?.configured ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}>
                    OpenAI: {systemStatus?.openai?.configured ? 'Configured' : 'Missing key'}
                  </Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">Model: {systemStatus?.openai?.model || 'unknown'}</Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">Key source: {systemStatus?.openai?.keySource || 'missing'}</Badge>
                </CardContent>
              </Card>
            </>
          ) : null}

          <Tabs
            value={activeSection}
            onValueChange={(value) => navigateToSection(value as AdminSection)}
            className="w-full min-w-0 space-y-4"
          >
            <div className="hidden" />

        <TabsContent value="dashboard" className="hidden" />

        <TabsContent value="system-config" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Secure Configuration Management</CardTitle>
                  <CardDescription>Add, update, or remove API keys and runtime variables encrypted at rest.</CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshConfigVariables()}
                  disabled={isRefreshingConfigVariables}
                >
                  {isRefreshingConfigVariables ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  {isRefreshingConfigVariables ? 'Refreshing...' : 'Refresh List'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="config-key">Key (e.g. OPENAI_API_KEY)</Label>
                  <Input
                    id="config-key"
                    value={configForm.key}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, key: e.target.value.toUpperCase() }))}
                    placeholder="OPENAI_API_KEY"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="config-secret-mode">Type</Label>
                  <Select
                    value={configForm.isSecret ? 'secret' : 'plain'}
                    onValueChange={(value) => setConfigForm((prev) => ({ ...prev, isSecret: value === 'secret' }))}
                  >
                    <SelectTrigger id="config-secret-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="secret">Secret (masked)</SelectItem>
                      <SelectItem value="plain">Plain config</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="config-value">Value</Label>
                <Textarea
                  id="config-value"
                  value={configForm.value}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder="Paste secure value"
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="config-description">Description (optional)</Label>
                <Input
                  id="config-description"
                  value={configForm.description}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What this key/config is used for"
                />
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void saveConfigVariable()} disabled={isSavingConfigVariable}>
                  {isSavingConfigVariable ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {isSavingConfigVariable ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>

              <div className="rounded-lg border">
                <div className="grid grid-cols-1 gap-3 p-3 text-sm md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] md:items-center">
                  <p className="font-medium">Key</p>
                  <p className="font-medium">Value Preview</p>
                  <p className="font-medium">Updated By</p>
                  <p className="font-medium text-right">Actions</p>
                </div>

                {(configVariables || []).map((item) => (
                  <div key={item.key} className="grid grid-cols-1 gap-3 border-t p-3 text-sm md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] md:items-center">
                    <div>
                      <p className="font-medium text-slate-900">{item.key}</p>
                      {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                      <p className="text-xs text-muted-foreground">{item.isSecret ? 'Secret' : 'Plain'}{item.updatedAt ? ` • ${new Date(item.updatedAt).toLocaleString()}` : ''}</p>
                    </div>
                    <p className="font-mono text-xs break-all text-slate-700">{item.valuePreview || '-'}</p>
                    <p className="text-xs text-muted-foreground">{item.updatedByEmail || '-'}</p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => void deleteConfigVariable(item.key)}
                        disabled={isDeletingConfigVariable === item.key}
                      >
                        {isDeletingConfigVariable === item.key ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        {isDeletingConfigVariable === item.key ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}

                {!configVariables.length ? (
                  <div className="border-t px-3 py-6 text-center text-sm text-muted-foreground">
                    No configuration values stored yet.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support-chat" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Live Support Conversations</CardTitle>
              <CardDescription>View student messages in real time and reply directly from admin panel.</CardDescription>
              <div className="flex justify-end gap-2">
                {adminDesktopAlertsEnabled ? (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdminDesktopAlertsPreference(false)}>
                    Desktop Alerts: On
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => void enableAdminDesktopAlerts()}>
                    Enable Desktop Alerts
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
                <div className="admin-support-list space-y-2 rounded-lg border p-2">
                  <Input
                    value={supportConversationQuery}
                    onChange={(e) => setSupportConversationQuery(e.target.value)}
                    placeholder="Search by name, email, mobile, or message"
                  />

                  <div className="max-h-[500px] space-y-2 overflow-auto">
                  {!filteredSupportConversations.length ? (
                    <p className="p-2 text-sm text-muted-foreground">No support conversations yet.</p>
                  ) : null}
                  {filteredSupportConversations.map((conversation) => (
                    <button
                      key={conversation.userId}
                      type="button"
                      onClick={() => setSelectedSupportUserId(conversation.userId)}
                      className={`admin-support-conversation w-full rounded-md border px-2.5 py-2 text-left transition ${
                        selectedSupportUserId === conversation.userId
                          ? 'admin-support-conversation-active border-indigo-300 bg-indigo-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-medium">{conversation.userName || conversation.email}</p>
                        {conversation.unreadForAdmin > 0 ? (
                          <Badge className="admin-support-unread-badge bg-rose-600 text-white">{conversation.unreadForAdmin}</Badge>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{conversation.email || 'No email'}</p>
                      <p className="admin-support-conversation-preview mt-1 line-clamp-2 text-xs text-slate-600">{conversation.lastMessageText || 'No message text'}</p>
                    </button>
                  ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="admin-support-header rounded-lg border p-3">
                    <p className="text-sm font-medium">{activeSupportUser?.name || 'Select a conversation'}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeSupportUser?.email || ''}
                      {activeSupportUser?.mobileNumber ? ` • ${activeSupportUser.mobileNumber}` : ''}
                    </p>
                    {activeSupportUser?.isDeleted ? (
                      <p className="mt-1 text-xs text-amber-700">This account was deleted. Thread is read-only.</p>
                    ) : null}
                  </div>

                  <div className="admin-support-banner rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800">
                    Secure chat channel active. Messages and files are protected in transit.
                  </div>

                  <div className="admin-support-thread max-h-[420px] space-y-2 overflow-auto rounded-lg border bg-slate-50 p-3">
                    {isSupportThreadLoading ? <p className="text-xs text-muted-foreground">Loading thread...</p> : null}
                    {!supportMessages.length ? <p className="text-xs text-muted-foreground">No messages in this thread.</p> : null}
                    {supportMessages.map((item) => (
                      <div
                        key={item.id}
                        className={`admin-support-bubble max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          item.senderRole === 'admin'
                            ? 'admin-support-bubble-admin ml-auto bg-indigo-600 text-white'
                            : 'admin-support-bubble-user mr-auto border bg-white text-slate-700'
                        }`}
                      >
                        {item.messageType === 'file' && item.attachment ? (
                          <div className="admin-support-attachment space-y-1">
                            <p>{item.text || 'Shared a file'}</p>
                            <a href={item.attachment.dataUrl} download={item.attachment.name} className="text-xs underline underline-offset-2">
                              {item.attachment.name}
                            </a>
                          </div>
                        ) : (
                          <p>{item.text}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ADMIN_SUPPORT_REACTIONS.map((emoji) => (
                            <button
                              key={`${item.id}-${emoji}`}
                              type="button"
                              className="admin-support-reaction-button rounded border bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-800"
                              onClick={() => void reactToSupportMessage(item.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        {Array.isArray(item.reactions) && item.reactions.length ? (
                          <p className={`admin-support-bubble-meta mt-1 text-[10px] ${item.senderRole === 'admin' ? 'text-indigo-100' : 'text-slate-500'}`}>
                            {item.reactions.map((reaction) => reaction.emoji).join(' ')}
                          </p>
                        ) : null}
                        <p className={`admin-support-bubble-meta mt-1 text-[10px] ${item.senderRole === 'admin' ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end gap-2">
                    <Textarea
                      value={supportReplyText}
                      onChange={(e) => setSupportReplyText(e.target.value)}
                      placeholder="Type support reply"
                      className="min-h-[82px]"
                      disabled={!selectedSupportUserId || Boolean(activeSupportUser?.isDeleted)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendSupportReply();
                        }
                      }}
                    />
                    <div className="flex flex-col gap-2">
                      <Button type="button" variant="outline" className="h-10" onClick={() => supportReplyFileInputRef.current?.click()} disabled={!selectedSupportUserId || isSendingSupportReply || Boolean(activeSupportUser?.isDeleted)}>
                        File
                      </Button>
                      <input
                        ref={supportReplyFileInputRef}
                        type="file"
                        accept={ADMIN_SUPPORT_ATTACHMENT_ACCEPT}
                        className="hidden"
                        onChange={(e) => void onSupportReplyFileSelected(e)}
                      />
                      <Button
                        className="h-10"
                        onClick={() => void sendSupportReply()}
                        disabled={isSendingSupportReply || !selectedSupportUserId || Boolean(activeSupportUser?.isDeleted) || (!supportReplyText.trim() && !supportReplyAttachment)}
                      >
                        {isSendingSupportReply ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </div>
                  {supportReplyAttachment ? (
                    <div className="admin-support-attachment-preview rounded-md border bg-slate-50 px-3 py-2 text-xs">
                      <p className="font-medium">Attached: {supportReplyAttachment.name}</p>
                      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setSupportReplyAttachment(null)}>
                        Remove File
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Create Account (Admin)</CardTitle>
              <CardDescription>Create student accounts directly without signup token flow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="admin-create-first-name">First Name</Label>
                  <Input
                    id="admin-create-first-name"
                    value={createUserForm.firstName}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-last-name">Last Name</Label>
                  <Input
                    id="admin-create-last-name"
                    value={createUserForm.lastName}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-email">Email</Label>
                  <Input
                    id="admin-create-email"
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="student@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-mobile">Mobile Number</Label>
                  <Input
                    id="admin-create-mobile"
                    value={createUserForm.mobileNumber}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, mobileNumber: e.target.value }))}
                    placeholder="+923001234567"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-password">Temporary Password</Label>
                  <Input
                    id="admin-create-password"
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="At least 8 characters"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void fillGeneratedTemporaryPassword()}>
                      Generate Temporary Password
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyTemporaryPassword()}>
                      Copy Password
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-plan">Initial Plan (Optional)</Label>
                  <Select
                    value={createUserForm.planId}
                    onValueChange={(value) => setCreateUserForm((prev) => ({ ...prev, planId: value }))}
                  >
                    <SelectTrigger id="admin-create-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(subscriptionOverview?.plans || []).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                      ))}
                      {!(subscriptionOverview?.plans || []).length ? <SelectItem value="basic_monthly">Basic Plan</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createUserForm.activatePlan}
                  onChange={(e) => setCreateUserForm((prev) => ({ ...prev, activatePlan: e.target.checked }))}
                />
                Activate selected plan immediately after account creation
              </label>

              <div>
                <Button onClick={() => void createUserAccount()} disabled={isCreatingUser}>
                  {isCreatingUser ? 'Creating Account...' : 'Create Account'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Remove users when needed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'No name'}
                      {' • '}
                      {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown date'}
                    </p>
                    <p className="text-xs text-muted-foreground">Mobile: {user.mobileNumber || 'N/A'}</p>
                    <Badge variant="outline" className="mt-1">{user.role}</Badge>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => void removeUser(user)}>
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Payment Approval Requests</CardTitle>
              <CardDescription>Verify transaction details + proof, approve to generate code, then send it in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">New / Pending Requests</h4>
                    <Badge variant="outline">{pendingSignupRequests.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-auto">
                    {pendingSignupRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 space-y-2 transition-all duration-300 ease-out">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm">User: {[request.firstName, request.lastName].filter(Boolean).join(' ').trim() || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Email: {request.email}</p>
                            <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Payment Method: {request.paymentMethod.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">Transaction ID: {request.paymentTransactionId}</p>
                            <p className="text-xs text-muted-foreground">{request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}</p>
                          </div>
                          <Badge variant="default">Pending</Badge>
                        </div>

                        {request.paymentProof ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                            >
                              View Proof
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                            >
                              Download Proof
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void approveSignupRequest(request)}>Approve</Button>
                        </div>
                      </div>
                    ))}
                    {!pendingSignupRequests.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No pending payment requests.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Completed Requests</h4>
                    <Badge variant="outline">{completedSignupRequests.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-auto">
                    {completedSignupRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 space-y-2 transition-all duration-300 ease-out">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm">User: {[request.firstName, request.lastName].filter(Boolean).join(' ').trim() || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Email: {request.email}</p>
                            <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Payment Method: {request.paymentMethod.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">Transaction ID: {request.paymentTransactionId}</p>
                            <p className="text-xs text-muted-foreground">{request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}</p>
                            {request.codeSentAt ? <p className="text-xs text-muted-foreground">Completed: {new Date(request.codeSentAt).toLocaleString()}</p> : null}
                            <div className="mt-1">
                              <Badge
                                variant="outline"
                                className={request.codeDeliveryStatus === 'sent' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}
                              >
                                {request.codeDeliveryStatus === 'sent'
                                  ? `Sent In-App${request.codeSentAt ? ` • ${new Date(request.codeSentAt).toLocaleString()}` : ''}`
                                  : 'Pending Send'}
                              </Badge>
                            </div>
                          </div>
                          <Badge className="bg-emerald-600 text-white">{request.status === 'approved' ? 'Approved' : 'Completed'}</Badge>
                        </div>

                        {request.paymentProof ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                            >
                              View Proof
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                            >
                              Download Proof
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          {issuedTokens[request.id] ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void copyToken(issuedTokens[request.id])}
                            >
                              Copy Code
                            </Button>
                          ) : null}

                          {request.status === 'approved' && request.codeDeliveryStatus !== 'sent' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void sendCodeInApp(request.id, 'signup')}
                            >
                              Send Code to User
                            </Button>
                          ) : null}
                        </div>

                        {issuedTokens[request.id] ? (
                          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs text-emerald-700">
                            Generated code: <strong>{issuedTokens[request.id]}</strong>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!completedSignupRequests.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No completed requests yet.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="premium-requests" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Premium Subscription Management</CardTitle>
              <CardDescription>Verify premium payments, generate activation codes, and send directly in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="premium-request-status">Status</Label>
                  <Select value={premiumRequestStatusFilter} onValueChange={setPremiumRequestStatusFilter}>
                    <SelectTrigger id="premium-request-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="premium-request-search">Search</Label>
                  <Input
                    id="premium-request-search"
                    value={premiumRequestQuery}
                    onChange={(e) => setPremiumRequestQuery(e.target.value)}
                    placeholder="Search by email, plan, transaction ID, or contact"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-auto">
                {premiumRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">Email: {request.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Plan: {request.planName || request.planId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Payment Method: {request.paymentMethod.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Transaction ID: {request.paymentTransactionId}
                        </p>
                        <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={request.codeDeliveryStatus === 'sent' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}
                          >
                            {request.codeDeliveryStatus === 'sent'
                              ? `Sent In-App${request.codeSentAt ? ` • ${new Date(request.codeSentAt).toLocaleString()}` : ''}`
                              : 'Pending Send'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}
                        </p>
                      </div>
                      <Badge variant={request.status === 'pending' ? 'default' : 'outline'}>{request.status}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {request.paymentProof ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void openPaymentProof(`/api/admin/subscriptions/requests/${request.id}/payment-proof`, request.paymentProof?.name || `premium-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                          >
                            View Proof
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void openPaymentProof(`/api/admin/subscriptions/requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `premium-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                          >
                            Download Proof
                          </Button>
                        </>
                      ) : null}

                      {issuedPremiumTokens[request.id] ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void copyToken(issuedPremiumTokens[request.id])}
                          >
                            Copy Code
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void sendCodeInApp(request.id, 'premium')}
                          >
                            Send Code
                          </Button>
                        </>
                      ) : null}
                    </div>

                    {issuedPremiumTokens[request.id] ? (
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs text-emerald-700">
                        Generated token: <strong>{issuedPremiumTokens[request.id]}</strong>
                      </div>
                    ) : null}

                    {request.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void approvePremiumRequest(request)}>Approve + Generate Token</Button>
                        <Button size="sm" variant="outline" onClick={() => void rejectPremiumRequest(request)}>Reject</Button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!premiumRequests.length ? (
                  <p className="text-sm text-muted-foreground">No premium requests matched the current filter.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password-recovery" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Password Recovery Requests</CardTitle>
              <CardDescription>Track automatic in-app password recovery verification and token generation activity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="password-recovery-status">Status</Label>
                  <Select value={passwordRecoveryStatusFilter} onValueChange={setPasswordRecoveryStatusFilter}>
                    <SelectTrigger id="password-recovery-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="not_found">Not Found</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password-recovery-search">Search</Label>
                  <Input
                    id="password-recovery-search"
                    value={passwordRecoveryQuery}
                    onChange={(e) => setPasswordRecoveryQuery(e.target.value)}
                    placeholder="Search by identifier, name, email, or mobile"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-auto">
                {passwordRecoveryRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">{request.userName || request.identifier}</p>
                        <p className="text-xs text-muted-foreground">User ID: {request.userId || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Email: {request.email || 'N/A'} | Mobile: {request.mobileNumber || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Matched by: {request.matchedBy.toUpperCase()} | Request: {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown'}</p>
                      </div>
                      <Badge variant={request.recoveryStatus === 'sent' ? 'default' : 'outline'}>{request.recoveryStatus}</Badge>
                    </div>

                    <p className="text-xs text-slate-500">Token is generated and shown directly in-app after successful verification.</p>
                  </div>
                ))}

                {!passwordRecoveryRequests.length ? (
                  <p className="text-sm text-muted-foreground">No recovery requests matched the current filter.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security-info" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Account recovery — security questions</CardTitle>
              <CardDescription>
                Read-only view of stored recovery questions. Answers are not stored in plaintext (only bcrypt hashes).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                role="status"
              >
                Sensitive information – handle carefully.
              </div>

              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSecurityInfoPage(1);
                  setSecurityInfoSearchApplied(securityInfoSearchInput);
                }}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="security-info-search">Search by email</Label>
                  <Input
                    id="security-info-search"
                    value={securityInfoSearchInput}
                    onChange={(e) => setSecurityInfoSearchInput(e.target.value)}
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={securityInfoLoading}>
                    {securityInfoLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Search'
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={securityInfoLoading}
                    onClick={() => void loadSecurityInfoPage()}
                  >
                    Refresh
                  </Button>
                </div>
              </form>

              <div className="overflow-x-auto rounded-md border min-h-[120px]">
                {securityInfoLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading…
                  </div>
                ) : !securityInfoRows.length ? (
                  <p className="px-3 py-10 text-center text-sm text-muted-foreground">No users matched this search.</p>
                ) : (
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">User email</th>
                        <th className="px-3 py-2 font-medium">Security question</th>
                        <th className="px-3 py-2 font-medium">Security answer</th>
                        <th className="px-3 py-2 font-medium w-[140px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityInfoRows.map((row) => {
                        const revealed = Boolean(securityInfoReveal[row.userId]);
                        return (
                          <tr key={row.userId} className="border-t">
                            <td className="px-3 py-2 align-top break-all">{row.email || '—'}</td>
                            <td className="px-3 py-2 align-top">{row.securityQuestion}</td>
                            <td className="px-3 py-2 align-top">
                              {revealed ? (
                                <span className="text-xs leading-relaxed text-slate-700">
                                  {row.securityAnswerNote}
                                  {row.hasSecurityAnswerHash ? (
                                    <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                                      Hash on file
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                                      No hash
                                    </Badge>
                                  )}
                                </span>
                              ) : (
                                <span className="font-mono text-xs tracking-widest text-muted-foreground">••••••••</span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  aria-label={revealed ? 'Hide answer details' : 'Show answer details'}
                                  onClick={() =>
                                    setSecurityInfoReveal((prev) => ({
                                      ...prev,
                                      [row.userId]: !prev[row.userId],
                                    }))
                                  }
                                >
                                  {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={async () => {
                                    const text = [
                                      `Email: ${row.email}`,
                                      `Security question: ${row.securityQuestion}`,
                                      `Answer note: ${row.securityAnswerNote}`,
                                      `Recovery hash stored: ${row.hasSecurityAnswerHash ? 'yes' : 'no'}`,
                                    ].join('\n');
                                    try {
                                      await navigator.clipboard.writeText(text);
                                      toast.success('Copied to clipboard.');
                                    } catch {
                                      toast.error('Could not copy.');
                                    }
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  Page {securityInfoPage} of {securityInfoTotalPages} · {securityInfoTotal} user
                  {securityInfoTotal === 1 ? '' : 's'}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={securityInfoLoading || securityInfoPage <= 1}
                    onClick={() => setSecurityInfoPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={securityInfoLoading || securityInfoPage >= securityInfoTotalPages}
                    onClick={() => setSecurityInfoPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcqs" className="space-y-4">
          <div className="space-y-4">
            <div className="min-w-0 space-y-4">
              <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setActiveMcqPanel((prev) => (prev === 'upload' ? null : 'upload'))}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${activeMcqPanel === 'upload' ? 'border-indigo-400 bg-indigo-100/70 text-indigo-900' : 'border-slate-300 bg-white/70 text-slate-700'}`}
                    >
                      Upload MCQs
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMcqPanel((prev) => (prev === 'deleter' ? null : 'deleter'))}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${activeMcqPanel === 'deleter' ? 'border-rose-400 bg-rose-100/70 text-rose-900' : 'border-slate-300 bg-white/70 text-slate-700'}`}
                    >
                      MCQs Deleter
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMcqPanel((prev) => (prev === 'bank' ? null : 'bank'))}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${activeMcqPanel === 'bank' ? 'border-cyan-400 bg-cyan-100/70 text-cyan-900' : 'border-slate-300 bg-white/70 text-slate-700'}`}
                    >
                      Update / Edit MCQs
                    </button>
                  </div>

                  {activeMcqPanel === 'deleter' ? (
                  <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                    <p className="text-sm font-medium text-rose-800">Bulk Delete MCQs (Admin Only)</p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Deletion Scope</Label>
                        <Select value={bulkDeleteMode} onValueChange={(value: BulkDeleteMode) => setBulkDeleteMode(value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Delete all MCQs</SelectItem>
                            <SelectItem value="subject">Delete by subject</SelectItem>
                            <SelectItem value="chapter">Delete by chapter</SelectItem>
                            <SelectItem value="section-topic">Delete by section/topic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {bulkDeleteMode !== 'all' ? (
                        <div className="space-y-1.5">
                          <Label>Subject</Label>
                          <Select
                            value={bulkDeleteSubject}
                            onValueChange={(value) => {
                              const normalized = String(value || '').trim().toLowerCase();
                              const isFlatTopic = FLAT_TOPIC_SUBJECTS.has(normalized);
                              setBulkDeleteSubject(value);
                              setBulkDeletePart('');
                              setBulkDeleteChapterKey('');
                              setBulkDeleteChapter('');
                              setBulkDeleteSectionOrTopic('');
                              if (isFlatTopic && bulkDeleteMode === 'chapter') {
                                setBulkDeleteMode('section-topic');
                              }
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                            <SelectContent>
                              {deleteSubjectOptions.map((item) => (
                                <SelectItem key={`delete-subject-${item.value}`} value={item.value}>{item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      {bulkDeleteMode !== 'all' && bulkDeleteMode !== 'subject' && bulkDeleteSubject && !isBulkDeleteFlatTopicSubject && isBulkDeletePartSelectionSubject ? (
                        <div className="space-y-1.5">
                          <Label>Part</Label>
                          <Select
                            value={bulkDeletePart}
                            disabled={!bulkDeleteSubject}
                            onValueChange={(value) => {
                              setBulkDeletePart(value);
                              setBulkDeleteChapterKey('');
                              setBulkDeleteChapter('');
                              setBulkDeleteSectionOrTopic('');
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                            <SelectContent>
                              {partOptions.map((item) => (
                                <SelectItem key={`delete-part-${item.value}`} value={item.value}>{item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>

                    {(bulkDeleteMode === 'chapter' || bulkDeleteMode === 'section-topic') && bulkDeleteSubject && !isBulkDeleteFlatTopicSubject ? (
                      <div className="space-y-1.5">
                        <Label>Chapter</Label>
                        <Select
                          value={bulkDeleteChapterKey}
                          disabled={!bulkDeleteSubject || (isBulkDeletePartSelectionSubject && !bulkDeletePart)}
                          onValueChange={(value) => {
                            setBulkDeleteChapterKey(value);
                            const selectedChapter = deleteChapterOptions.find((item) => item.value === value);
                            setBulkDeleteChapter(selectedChapter?.chapterTitle || '');
                            setBulkDeleteSectionOrTopic('');
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                          <SelectContent>
                            {deleteChapterOptions.map((item) => (
                              <SelectItem key={`delete-chapter-${item.value}`} value={item.value}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {bulkDeleteMode === 'section-topic' && bulkDeleteSubject && (isBulkDeleteFlatTopicSubject || bulkDeleteChapter) ? (
                      <div className="space-y-1.5">
                        <Label>Section / Topic</Label>
                        <Select
                          value={bulkDeleteSectionOrTopic}
                          disabled={isBulkDeleteFlatTopicSubject ? !bulkDeleteSubject : !bulkDeleteChapterKey}
                          onValueChange={setBulkDeleteSectionOrTopic}
                        >
                          <SelectTrigger><SelectValue placeholder="Select section/topic" /></SelectTrigger>
                          <SelectContent>
                            {deleteSectionOptions.map((item) => (
                              <SelectItem key={`delete-section-${item}`} value={item}>{item}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        onClick={() => void bulkDeleteMcqs()}
                        disabled={bulkDeleting}
                      >
                        {bulkDeleting ? 'Deleting...' : 'Delete in Bulk'}
                      </Button>
                    </div>
                  </div>
                  ) : null}

                  {activeMcqPanel === 'upload' ? (
                  <div className="space-y-3 rounded-lg border border-indigo-200/70 bg-indigo-50/25 p-3">
                      <div className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Button
                            type="button"
                            variant={uploadMode === 'manual' ? 'default' : 'outline'}
                            onClick={() => setUploadMode('manual')}
                          >
                            Upload by Manual
                          </Button>
                          <Button
                            type="button"
                            variant={uploadMode === 'document' ? 'default' : 'outline'}
                            onClick={() => setUploadMode('document')}
                          >
                            Upload by Document
                          </Button>
                          <Button
                            type="button"
                            variant={uploadMode === 'ai-generated' ? 'default' : 'outline'}
                            onClick={() => setUploadMode('ai-generated')}
                          >
                            AI Generated MCQs
                          </Button>
                        </div>

                        {uploadMode === 'document' ? (
                        <div className="space-y-3 rounded-lg border border-indigo-200 bg-white/70 p-3 dark:border-indigo-300/30 dark:bg-white/5">
                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-1.5">
                              <Label>Subject</Label>
                              <Select
                                value={form.subject}
                                onValueChange={(value) => {
                                  setUploadChapterKey('');
                                  setForm((prev) => ({
                                    ...prev,
                                    subject: value,
                                    part: '',
                                    chapter: '',
                                    section: '',
                                    topic: '',
                                  }));
                                }}
                              >
                                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                                <SelectContent>
                                  {manualSubjectOptions.map((item) => (
                                    <SelectItem key={`document-subject-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {form.subject && !isManualFlatTopicSubject && isManualPartSelectionSubject ? (
                              <div className="space-y-1.5">
                                <Label>Part</Label>
                                <Select
                                  value={form.part}
                                  onValueChange={(value) => {
                                    setUploadChapterKey('');
                                    setForm((prev) => ({
                                      ...prev,
                                      part: value,
                                      chapter: '',
                                      section: '',
                                      topic: '',
                                    }));
                                  }}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                                  <SelectContent>
                                    {partOptions.map((item) => (
                                      <SelectItem key={`document-part-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}

                            {form.subject && !isManualFlatTopicSubject ? (
                              <div className="space-y-1.5">
                                <Label>Chapter</Label>
                                <Select
                                  value={uploadChapterKey}
                                  disabled={!form.subject || (isManualPartSelectionSubject && !form.part)}
                                  onValueChange={(value) => {
                                    setUploadChapterKey(value);
                                    const selectedChapter = manualChapterOptions.find((item) => item.value === value);
                                    setForm((prev) => ({
                                      ...prev,
                                      part: isManualPartSelectionSubject
                                        ? (selectedChapter?.part || prev.part || '')
                                        : '',
                                      chapter: selectedChapter?.chapterTitle || '',
                                      section: '',
                                      topic: '',
                                    }));
                                  }}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                                  <SelectContent>
                                    {manualChapterOptions.map((item) => (
                                      <SelectItem key={`document-chapter-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}

                            {form.subject && (isManualFlatTopicSubject || form.chapter) ? (
                              <div className="space-y-1.5">
                                <Label>Section / Topic</Label>
                                <Select
                                  value={form.section}
                                  disabled={isManualFlatTopicSubject ? !form.subject : !uploadChapterKey}
                                  onValueChange={(value) => setForm((prev) => ({ ...prev, section: value, topic: value }))}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select section/topic" /></SelectTrigger>
                                  <SelectContent>
                                    {manualSectionOptions.map((item) => (
                                      <SelectItem key={`document-section-${item}`} value={item}>{item}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Document Parser</p>
                            <p className="text-xs text-muted-foreground">
                              Upload PDF/DOC/DOCX/TXT or paste MCQs, then click Parse / Analyze Document to auto-fill structured MCQ fields.
                            </p>
                          </div>

                          <details className="rounded-md border border-indigo-200/80 bg-indigo-50/35 p-2 dark:border-indigo-300/30 dark:bg-indigo-500/10">
                            <summary className="cursor-pointer list-none text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                              Paste MCQ
                            </summary>
                            <div className="mt-2 space-y-2">
                              <p className="text-xs text-muted-foreground">
                                Parse one MCQ at a time from pasted text or a single MCQ image.
                              </p>
                              <MathEditorField
                                id="paste-single-mcq-input"
                                label="Paste MCQ Content"
                                value={singleMcqInput}
                                onValueChange={(nextValue) => setSingleMcqInput(nextValue)}
                                onPasteIntercept={handlePasteMcqEditorPasteIntercept}
                                insertImageTokenOnPaste={false}
                                className="min-h-[170px]"
                                placeholder={[
                                  'question',
                                  'A. option',
                                  'B. option',
                                  'C. option',
                                  'D. option',
                                  'Correct: answer',
                                  'Explanation: explanation text',
                                ].join('\n')}
                              />

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={fillFieldsFromPastedMcq}
                                  disabled={!singleMcqInput.trim()}
                                >
                                  Fill the Fields
                                </Button>
                              </div>

                            </div>
                          </details>

                          <Input
                            ref={bulkDocumentInputRef}
                            id="mcq-bulk-document"
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                          />

                          {bulkFile ? <p className="text-xs text-muted-foreground">Selected: {bulkFile.name}</p> : null}

                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={() => bulkDocumentInputRef.current?.click()}>
                              Upload Document
                            </Button>
                            <Button type="button" onClick={() => void analyzeBulkMcqs()} disabled={bulkProcessing || (!bulkFile && !bulkInput.trim())}>
                              {bulkProcessing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  {bulkProcessingLabel}
                                </>
                              ) : 'Analyse by AI'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const hierarchyContext = resolveDocumentHierarchyContext();
                                if (!hierarchyContext) return;
                                setBulkParsed((previous) => previous.map((item) => ({
                                  ...item,
                                  subject: hierarchyContext.subject,
                                  part: hierarchyContext.part,
                                  chapter: hierarchyContext.chapter,
                                  section: hierarchyContext.section,
                                  topic: hierarchyContext.topic,
                                })));
                                setShowParsedPreview(true);
                              }}
                              disabled={!bulkParsed.length}
                            >
                              Parse MCQs
                            </Button>
                            <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2 sm:flex-none">
                              <Select value={bulkApplyDifficultyLevel} onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => setBulkApplyDifficultyLevel(value)}>
                                <SelectTrigger className="h-9 w-full sm:w-[150px]">
                                  <SelectValue placeholder="Difficulty" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Easy">Easy</SelectItem>
                                  <SelectItem value="Medium">Medium</SelectItem>
                                  <SelectItem value="Hard">Hard</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={applyDifficultyToAllParsedMcqs}
                                disabled={!bulkParsed.length || !bulkAnalysisReady || bulkProcessing}
                              >
                                Apply to All MCQs
                              </Button>
                            </div>
                          </div>

                          {bulkParseErrors.length ? (
                            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                              {bulkParseErrors.map((error, idx) => (
                                <p key={`bulk-parse-error-${idx}`}>• {error}</p>
                              ))}
                            </div>
                          ) : null}

                          {showParsedPreview && bulkParsed.length ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">
                                  Parsed preview: {bulkParsed.length} MCQ(s). Review/edit before uploading.
                                </p>
                              </div>

                              {(() => {
                                const hierarchyContext = resolveDocumentHierarchyContext(false);
                                if (!hierarchyContext) return null;
                                return (
                                  <div className="rounded-md border border-indigo-300/70 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-300/40 dark:bg-indigo-500/10 dark:text-indigo-100">
                                    Upload target: {hierarchyContext.label}
                                  </div>
                                );
                              })()}

                              <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
                                {bulkParsed.map((item, mcqIndex) => (
                                  <div key={`bulk-parsed-item-${mcqIndex}`} className="space-y-3 rounded-lg border border-indigo-200/80 bg-indigo-50/30 p-3 dark:border-indigo-300/30 dark:bg-indigo-500/10">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">Parsed MCQ #{mcqIndex + 1}</p>
                                      <Button type="button" size="sm" variant="outline" onClick={() => removeParsedMcq(mcqIndex)}>
                                        Remove
                                      </Button>
                                    </div>

                                    <MathEditorField
                                      id={`bulk-question-${mcqIndex}`}
                                      label="Question Text"
                                      value={item.question}
                                      className="min-h-[84px]"
                                      onValueChange={(nextValue) => updateParsedMcq(mcqIndex, (current) => ({ ...current, question: nextValue }))}
                                    />

                                    <div className="space-y-1">
                                      <Label>Question Image URL (if present)</Label>
                                      <Input value={item.questionImageUrl || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, questionImageUrl: e.target.value }))} placeholder="https://..." />
                                    </div>

                                    <div className="space-y-1">
                                      <Label>Detected Question Image</Label>
                                      {item.questionImageDataUrl || item.questionImageUrl ? (
                                        <img
                                          src={normalizeMcqImageSrc(item.questionImageDataUrl || item.questionImageUrl)}
                                          alt={`Parsed question image ${mcqIndex + 1}`}
                                          className="max-h-44 w-auto rounded border border-indigo-300/60 bg-white/70 object-contain p-1"
                                        />
                                      ) : (
                                        <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                          No image detected
                                        </div>
                                      )}
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <Label>Options (A-E)</Label>
                                        <Button type="button" size="sm" variant="outline" onClick={() => addParsedOption(mcqIndex)} disabled={(item.options || []).length >= 5}>
                                          Add Option
                                        </Button>
                                      </div>
                                      <div className="space-y-2">
                                        {(item.options || []).map((option, optionIndex) => (
                                          <div key={`bulk-option-${mcqIndex}-${optionIndex}`} className="space-y-1 rounded-md border border-indigo-300/40 p-2">
                                            <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
                                              <MathEditorField
                                                id={`bulk-option-${mcqIndex}-${optionIndex}`}
                                                label={`Option ${String.fromCharCode(65 + optionIndex)}`}
                                                value={option}
                                                onValueChange={(nextValue) => updateParsedOption(mcqIndex, optionIndex, nextValue)}
                                              />
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeParsedOption(mcqIndex, optionIndex)}
                                                disabled={(item.options || []).length <= 2}
                                              >
                                                Remove
                                              </Button>
                                            </div>
                                            <div className="space-y-1">
                                              <Label className="text-xs text-muted-foreground">Detected Option Image</Label>
                                              {item.optionImageDataUrls?.[optionIndex] ? (
                                                <img
                                                  src={normalizeMcqImageSrc(item.optionImageDataUrls[optionIndex])}
                                                  alt={`Parsed option image ${mcqIndex + 1}-${String.fromCharCode(65 + optionIndex)}`}
                                                  className="max-h-32 w-auto rounded border border-indigo-300/60 bg-white/70 object-contain p-1"
                                                />
                                              ) : (
                                                <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                                  No image detected
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <Label>Correct Answer</Label>
                                        <Input value={item.answer} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, answer: e.target.value }))} placeholder="A / 1 / exact option text" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Difficulty</Label>
                                        <Select value={item.difficulty || 'Medium'} onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => updateParsedMcq(mcqIndex, (current) => ({ ...current, difficulty: value }))}>
                                          <SelectTrigger><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="Easy">Easy</SelectItem>
                                            <SelectItem value="Medium">Medium</SelectItem>
                                            <SelectItem value="Hard">Hard</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <MathEditorField
                                      id={`bulk-explanation-${mcqIndex}`}
                                      label="Explanation"
                                      value={item.tip || ''}
                                      className="min-h-[80px]"
                                      onValueChange={(nextValue) => updateParsedMcq(mcqIndex, (current) => ({ ...current, tip: nextValue }))}
                                    />

                                    <div className="space-y-1">
                                      <Label>Short Trick</Label>
                                      <Textarea value={item.shortTrick || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, shortTrick: e.target.value }))} className="min-h-[70px]" />
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                        Question Image: {item.questionImageDataUrl ? 'Detected (embedded image data)' : item.questionImageUrl ? 'Detected (URL reference)' : 'Not detected'}
                                      </div>
                                      <div className="space-y-1">
                                        <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                          Explanation Image: {item.explanationImageDataUrl ? 'Detected' : 'Not detected'}
                                        </div>
                                        {item.explanationImageDataUrl ? (
                                          <img
                                            src={item.explanationImageDataUrl}
                                            alt={`Parsed explanation image ${mcqIndex + 1}`}
                                            className="max-h-32 w-auto rounded border border-indigo-300/60 bg-white/70 object-contain p-1"
                                          />
                                        ) : (
                                          <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                            No image detected
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap gap-2 border-t border-indigo-200/70 pt-3">
                                <Button type="button" variant="outline" onClick={openDocumentMcqPreview}>
                                  Preview Test
                                </Button>
                                <Button id="uploadAllMcqsBtn" type="button" onClick={() => void uploadAllMCQs()} disabled={bulkUploading}>
                                  {bulkUploading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Uploading...
                                    </>
                                  ) : 'Upload All MCQs'}
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        ) : null}

                        {uploadMode === 'manual' ? (
                          <form className="space-y-3" onSubmit={handleManualMcqSubmit}>
                            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                              <div className="space-y-1.5">
                                <Label>Subject</Label>
                                <Select
                                  value={form.subject}
                                  onValueChange={(value) => {
                                    setUploadChapterKey('');
                                    setForm((prev) => ({
                                      ...prev,
                                      subject: value,
                                      part: '',
                                      chapter: '',
                                      section: '',
                                      topic: '',
                                    }));
                                  }}
                                >
                                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                                  <SelectContent>
                                    {manualSubjectOptions.map((item) => (
                                      <SelectItem key={`manual-subject-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {form.subject && !isManualFlatTopicSubject && isManualPartSelectionSubject ? (
                                <div className="space-y-1.5">
                                  <Label>Part</Label>
                                  <Select
                                    value={form.part}
                                    onValueChange={(value) => {
                                      setUploadChapterKey('');
                                      setForm((prev) => ({
                                        ...prev,
                                        part: value,
                                        chapter: '',
                                        section: '',
                                        topic: '',
                                      }));
                                    }}
                                  >
                                    <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                                    <SelectContent>
                                      {partOptions.map((item) => (
                                        <SelectItem key={`manual-part-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                              {form.subject && !isManualFlatTopicSubject ? (
                                <div className="space-y-1.5">
                                  <Label>Chapter</Label>
                                  <Select
                                    value={uploadChapterKey}
                                    disabled={!form.subject || (isManualPartSelectionSubject && !form.part)}
                                    onValueChange={(value) => {
                                      setUploadChapterKey(value);
                                      const selectedChapter = manualChapterOptions.find((item) => item.value === value);
                                      setForm((prev) => ({
                                        ...prev,
                                        part: isManualPartSelectionSubject
                                          ? (selectedChapter?.part || prev.part || '')
                                          : '',
                                        chapter: selectedChapter?.chapterTitle || '',
                                        section: '',
                                        topic: '',
                                      }));
                                    }}
                                  >
                                    <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                                    <SelectContent>
                                      {manualChapterOptions.map((item) => (
                                        <SelectItem key={`manual-chapter-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                              {form.subject && (isManualFlatTopicSubject || form.chapter) ? (
                                <div className="space-y-1.5">
                                  <Label>Section / Topic</Label>
                                  <Select
                                    value={form.section}
                                    disabled={isManualFlatTopicSubject ? !form.subject : !uploadChapterKey}
                                    onValueChange={(value) => setForm((prev) => ({ ...prev, section: value, topic: value }))}
                                  >
                                    <SelectTrigger><SelectValue placeholder="Select section/topic" /></SelectTrigger>
                                    <SelectContent>
                                      {manualSectionOptions.map((item) => (
                                        <SelectItem key={`manual-section-${item}`} value={item}>{item}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                            </div>

                        <div className="space-y-2 rounded-md border border-indigo-200/70 bg-white/70 p-2">
                          <Label>Question</Label>
                          <div className="inline-flex overflow-hidden rounded-md border">
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, questionType: 'text' }))}
                              className={`px-3 py-1.5 text-xs ${form.questionType !== 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                            >
                              Text
                            </button>
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, questionType: 'image' }))}
                              className={`px-3 py-1.5 text-xs ${form.questionType === 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                            >
                              Image
                            </button>
                          </div>

                          {form.questionType !== 'image' ? (
                            <MathEditorField
                              id="questionInput"
                              label="Question Text"
                              value={form.question}
                              placeholder="Question Text"
                              className="min-h-[95px]"
                              onValueChange={(nextValue) => setForm((prev) => ({ ...prev, question: nextValue }))}
                            />
                          ) : null}
                        </div>

                        {form.questionType === 'image' ? (
                        <div className="space-y-1.5">
                          <Label htmlFor="mcq-question-image-upload">Upload Question Image</Label>
                          <Input
                            id="mcq-question-image-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              if (!file) return;
                              void openGestureImageEditorForFile(file, { kind: 'question' });
                              e.currentTarget.value = '';
                            }}
                          />
                          {form.questionImage ? (
                            <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                              <span>{form.questionImage.name}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setForm((prev) => ({ ...prev, questionImage: null }))}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                        ) : null}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label>Options (A-D)</Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setForm((prev) => {
                                if (prev.optionMedia.length >= 8) return prev;
                                const nextKey = String.fromCharCode(65 + prev.optionMedia.length);
                                return {
                                  ...prev,
                                  optionMedia: [...prev.optionMedia, { key: nextKey, text: '', image: null }],
                                  optionTypes: [...prev.optionTypes, 'text'],
                                };
                              })}
                            >
                              Add Option
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {form.optionMedia.map((option, optionIdx) => (
                              <div key={`option-${option.key}`} className="space-y-2 rounded-md border p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Label>Option {option.key}</Label>
                                  <div className="inline-flex overflow-hidden rounded-md border">
                                    <button
                                      type="button"
                                      onClick={() => setForm((prev) => {
                                        const optionTypes = [...prev.optionTypes];
                                        optionTypes[optionIdx] = 'text';
                                        return { ...prev, optionTypes };
                                      })}
                                      className={`px-3 py-1.5 text-xs ${(form.optionTypes[optionIdx] || 'text') !== 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                                    >
                                      Text
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setForm((prev) => {
                                        const optionTypes = [...prev.optionTypes];
                                        optionTypes[optionIdx] = 'image';
                                        return { ...prev, optionTypes };
                                      })}
                                      className={`px-3 py-1.5 text-xs ${(form.optionTypes[optionIdx] || 'text') === 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                                    >
                                      Image
                                    </button>
                                  </div>
                                </div>

                                {(form.optionTypes[optionIdx] || 'text') !== 'image' ? (
                                  <MathEditorField
                                    id={`option-input-${normalizeMathInputId(option.key)}`}
                                    label={`Option ${option.key}`}
                                    value={option.text}
                                    placeholder={`Option ${option.key} text`}
                                    onValueChange={(nextValue) => {
                                      setForm((prev) => {
                                        const optionMedia = [...prev.optionMedia];
                                        optionMedia[optionIdx] = { ...optionMedia[optionIdx], text: nextValue };
                                        return { ...prev, optionMedia };
                                      });
                                    }}
                                  />
                                ) : null}

                                {(form.optionTypes[optionIdx] || 'text') === 'image' ? (
                                <div className="space-y-1.5">
                                  <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                    capture="environment"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null;
                                      if (!file) return;
                                      void openGestureImageEditorForFile(file, {
                                        kind: 'option',
                                        optionIndex: optionIdx,
                                        optionKey: option.key,
                                      });
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                  {option.image ? (
                                    <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                      <span>{option.image.name}</span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setForm((prev) => {
                                            const optionMedia = [...prev.optionMedia];
                                            optionMedia[optionIdx] = { ...optionMedia[optionIdx], image: null };
                                            return { ...prev, optionMedia };
                                          });
                                        }}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Correct Answer</Label>
                            <Select value={form.answer} onValueChange={(value) => setForm((prev) => ({ ...prev, answer: value }))}>
                              <SelectTrigger><SelectValue placeholder="Select correct answer" /></SelectTrigger>
                              <SelectContent>
                                {form.optionMedia.slice(0, 8).map((option) => (
                                  <SelectItem key={`answer-${option.key}`} value={option.key}>{option.key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Difficulty</Label>
                            <Select value={form.difficulty} onValueChange={(value) => setForm((prev) => ({ ...prev, difficulty: value }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Easy">Easy</SelectItem>
                                <SelectItem value="Medium">Medium</SelectItem>
                                <SelectItem value="Hard">Hard</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
                          <p className="text-sm font-medium text-indigo-900">Explanation / Short Trick (optional)</p>

                          <MathEditorField
                            id="explanationInput"
                            label="Explanation"
                            value={form.explanationText}
                            onValueChange={(nextValue) => setForm((prev) => ({ ...prev, explanationText: nextValue, shortTrickText: '' }))}
                            className="min-h-[110px]"
                            placeholder="Write explanation, short trick, formula, steps, or reasoning"
                          />

                          <div className="space-y-1.5">
                            <Label>Image</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => explanationImageInputRef.current?.click()}
                              >
                                Upload Image
                              </Button>
                              <Input
                                ref={explanationImageInputRef}
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                                capture="environment"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  if (!file) return;
                                  void openGestureImageEditorForFile(file, { kind: 'explanation' });
                                  e.currentTarget.value = '';
                                }}
                              />
                              <p className="text-xs text-muted-foreground">Supported: JPG, PNG, WEBP, SVG, GIF</p>
                            </div>

                            {form.explanationImage ? (
                              <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                <span>{form.explanationImage.name}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setForm((prev) => ({ ...prev, explanationImage: null }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button id="previewBtn" type="button" variant="outline" onClick={openManualMcqPreview}>
                            Preview Test
                          </Button>
                          <Button id="addMcqBtn" type="submit" disabled={isSavingMcq}>
                            {isSavingMcq ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {form.id ? 'Updating...' : 'Adding...'}
                              </>
                            ) : form.id ? 'Update MCQ' : 'Add MCQs'}
                          </Button>
                          <Button type="button" variant="outline" onClick={resetForm}>Clear</Button>
                        </div>
                          </form>
                        ) : null}

                        {uploadMode === 'ai-generated' ? (
                          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6 dark:border-slate-700 dark:bg-slate-950/40">
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                                <div className="space-y-1.5">
                                  <Label>Subject</Label>
                                  <Select
                                    value={aiGenSubject}
                                    onValueChange={(value) => {
                                      setAiGenSubject(value);
                                      setAiGenPart('');
                                      setAiGenChapter('');
                                      setAiGenChapterKey('');
                                      setAiGenSection('');
                                      setAiGenTopic('');
                                    }}
                                  >
                                    <SelectTrigger className="rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-0">
                                      <SelectValue placeholder="Select Subject" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {aiPromptSubjectOptions.map((item) => (
                                        <SelectItem key={`ai-subject-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-xs text-muted-foreground">
                                    {aiPromptTemplateMeta.status === 'loading' ? 'Loading subject prompt template...' : ''}
                                    {aiPromptTemplateMeta.status === 'loaded' ? `Prompt loaded: ${aiPromptTemplateMeta.fileName}` : ''}
                                    {aiPromptTemplateMeta.status === 'error' ? `Prompt load failed: ${aiPromptTemplateMeta.message}` : ''}
                                  </p>
                                </div>

                                {aiGenSubject && !isAiGenFlatTopicSubject && isAiGenPartSelectionSubject ? (
                                  <div className="space-y-1.5">
                                    <Label>Part</Label>
                                    <Select
                                      value={aiGenPart}
                                      onValueChange={(value) => {
                                        setAiGenPart(value);
                                        setAiGenChapter('');
                                        setAiGenChapterKey('');
                                        setAiGenSection('');
                                        setAiGenTopic('');
                                      }}
                                    >
                                      <SelectTrigger className="rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"><SelectValue placeholder="Select Part" /></SelectTrigger>
                                      <SelectContent>
                                        {partOptions.map((item) => (
                                          <SelectItem key={`ai-part-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : null}

                                {aiGenSubject && !isAiGenFlatTopicSubject ? (
                                  <div className="space-y-1.5">
                                    <Label>Chapter</Label>
                                    <Select
                                      value={aiGenChapterKey}
                                      disabled={!aiGenSubject || (isAiGenPartSelectionSubject && !aiGenPart)}
                                      onValueChange={(value) => {
                                        setAiGenChapterKey(value);
                                        const selectedChapter = aiGenChapterOptions.find((item) => item.value === value);
                                        setAiGenPart(isAiGenPartSelectionSubject ? (selectedChapter?.part || aiGenPart || '') : '');
                                        setAiGenChapter(selectedChapter?.chapterTitle || '');
                                        setAiGenSection('');
                                        setAiGenTopic('');
                                      }}
                                    >
                                      <SelectTrigger className="rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"><SelectValue placeholder="Select chapter" /></SelectTrigger>
                                      <SelectContent>
                                        {aiGenChapterOptions.map((item) => (
                                          <SelectItem key={`ai-chapter-${item.value}`} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : null}

                                {aiGenSubject && (isAiGenFlatTopicSubject || aiGenChapter) ? (
                                  <div className="space-y-1.5">
                                    <Label>Section / Topic</Label>
                                    <Select
                                      value={aiGenSection}
                                      disabled={isAiGenFlatTopicSubject ? !aiGenSubject : !aiGenChapterKey}
                                      onValueChange={(value) => {
                                        setAiGenSection(value);
                                        setAiGenTopic(value);
                                      }}
                                    >
                                      <SelectTrigger className="rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"><SelectValue placeholder="Select section/topic" /></SelectTrigger>
                                      <SelectContent>
                                        {aiGenSectionOptions.map((item) => (
                                          <SelectItem key={`ai-section-${item}`} value={item}>{item}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : null}
                              </div>

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <Label>Document Upload (PDF, DOCX, TXT, JPG, PNG)</Label>
                                  <Input
                                    type="file"
                                    accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png"
                                    onChange={(e) => setAiGenFile(e.target.files?.[0] || null)}
                                    className="rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500"
                                  />
                                  {aiGenFile ? <p className="text-xs text-muted-foreground">Selected: {aiGenFile.name}</p> : null}
                                </div>

                                <div className="space-y-1.5">
                                  <Label>Difficulty</Label>
                                  <Select value={aiGenDifficulty} onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => setAiGenDifficulty(value)}>
                                    <SelectTrigger className="rounded-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Easy">Easy</SelectItem>
                                      <SelectItem value="Medium">Medium</SelectItem>
                                      <SelectItem value="Hard">Hard</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <Label>Instructions</Label>
                                <Textarea
                                  value={aiGenInstructions}
                                  onChange={(e) => setAiGenInstructions(e.target.value)}
                                  placeholder="Optional: provide generation instructions for this MCQ"
                                  className="min-h-[90px] rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label>Source Text (optional)</Label>
                                <Textarea
                                  value={aiGenSourceText}
                                  onChange={(e) => setAiGenSourceText(e.target.value)}
                                  placeholder="Optional: paste source text instead of uploading a file"
                                  className="min-h-[110px] rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500"
                                />
                              </div>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <Button type="button" onClick={() => void generateAiMcq()} disabled={aiGenGenerating || aiGenUploading}>
                                  {aiGenGenerating ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Generating...
                                    </>
                                  ) : 'Generate MCQs'}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setAiGenGenerated(null);
                                    setAiGenGenerateErrors([]);
                                  }}
                                  disabled={aiGenGenerating || aiGenUploading}
                                >
                                  Clear Generated
                                </Button>
                              </div>

                              {aiGenGenerateErrors.length ? (
                                <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                                  {aiGenGenerateErrors.map((error, idx) => (
                                    <p key={`ai-gen-error-${idx}`}>• {error}</p>
                                  ))}
                                </div>
                              ) : null}

                              {aiGenGenerated ? (
                                <div className="space-y-3 rounded-lg border border-indigo-200/80 bg-indigo-50/30 p-3 dark:border-indigo-300/30 dark:bg-indigo-500/10">
                                <MathEditorField
                                  id="ai-generated-question"
                                  label="Generated Question"
                                  value={aiGenGenerated.question}
                                  className="min-h-[90px]"
                                  onValueChange={(nextValue) => setAiGenGenerated((prev) => (prev ? { ...prev, question: nextValue } : prev))}
                                />

                                <div className="grid gap-2 md:grid-cols-2">
                                  {aiGenGenerated.options.slice(0, 4).map((option, idx) => (
                                    <MathEditorField
                                      key={`ai-generated-option-${idx}`}
                                      id={`ai-generated-option-${idx}`}
                                      label={`Option ${String.fromCharCode(65 + idx)}`}
                                      value={option}
                                      onValueChange={(nextValue) => {
                                        setAiGenGenerated((prev) => {
                                          if (!prev) return prev;
                                          const nextOptions = [...prev.options];
                                          nextOptions[idx] = nextValue;
                                          return { ...prev, options: nextOptions };
                                        });
                                      }}
                                    />
                                  ))}
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1.5">
                                    <Label>Correct Answer</Label>
                                    <Input
                                      value={aiGenGenerated.answer}
                                      onChange={(e) => setAiGenGenerated((prev) => (prev ? { ...prev, answer: e.target.value } : prev))}
                                      placeholder="A / B / C / D or exact option text"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label>Difficulty</Label>
                                    <Select
                                      value={aiGenGenerated.difficulty}
                                      onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => {
                                        setAiGenGenerated((prev) => (prev ? { ...prev, difficulty: value } : prev));
                                        setAiGenDifficulty(value);
                                      }}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Easy">Easy</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="Hard">Hard</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <MathEditorField
                                  id="ai-generated-explanation"
                                  label="Explanation"
                                  value={aiGenGenerated.explanation}
                                  className="min-h-[90px]"
                                  onValueChange={(nextValue) => setAiGenGenerated((prev) => (prev ? { ...prev, explanation: nextValue } : prev))}
                                />

                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" variant="outline" onClick={openAiGeneratedMcqPreview} disabled={aiGenGenerating || aiGenUploading}>
                                    Preview Test
                                  </Button>
                                  <Button type="button" onClick={() => void uploadGeneratedAiMcq()} disabled={aiGenUploading || aiGenGenerating}>
                                    {aiGenUploading ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Uploading...
                                      </>
                                    ) : 'Upload MCQ'}
                                  </Button>
                                </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                  </div>
                  ) : null}
              </div>

              {activeMcqPanel === 'bank' ? (
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Update / Edit MCQs</CardTitle>
                  <CardDescription>
                    {selectedHierarchy
                      ? 'Edit or remove questions for the selected section/topic.'
                      : 'Select subject, part (where required), chapter, and section/topic to load MCQs.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Subject</Label>
                      <Select
                        value={bankFilterSubject}
                        onValueChange={(value) => {
                          setBankFilterSubject(value);
                          setBankFilterPart('');
                          setBankFilterChapterKey('');
                          setBankFilterSection('');
                          setSelectedHierarchy(null);
                          setMcqs([]);
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                        <SelectContent>
                          {bankSubjectOptions.map((item) => (
                            <SelectItem key={`bank-subject-${item.value}`} value={item.value}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!isBankFlatTopicSubject && isBankPartSelectionSubject ? (
                      <div className="space-y-1.5">
                        <Label>Part</Label>
                        <Select
                          value={bankFilterPart}
                          disabled={!bankFilterSubject}
                          onValueChange={(value) => {
                            setBankFilterPart(value);
                            setBankFilterChapterKey('');
                            setBankFilterSection('');
                            setSelectedHierarchy(null);
                            setMcqs([]);
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                          <SelectContent>
                            {partOptions.map((item) => (
                              <SelectItem key={`bank-part-${item.value}`} value={item.value}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {!isBankFlatTopicSubject ? (
                      <div className="space-y-1.5">
                        <Label>Chapter</Label>
                        <Select
                          value={bankFilterChapterKey}
                          disabled={!bankFilterSubject || (isBankPartSelectionSubject && !bankFilterPart)}
                          onValueChange={(value) => {
                            setBankFilterChapterKey(value);
                            setBankFilterSection('');
                            setSelectedHierarchy(null);
                            setMcqs([]);
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                          <SelectContent>
                            {bankChapterOptions.map((item) => (
                              <SelectItem key={`bank-chapter-${item.value}`} value={item.value}>{item.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label>Section / Topic</Label>
                      <Select
                        value={bankFilterSection}
                        disabled={isBankFlatTopicSubject ? !bankFilterSubject : !bankFilterChapterKey}
                        onValueChange={(value) => {
                          setBankFilterSection(value);
                          if (isBankFlatTopicSubject) {
                            if (!authToken) return;
                            void handleFlatTopicSelection({
                              tabKey: bankFilterSubject as 'quantitative-mathematics' | 'design-aptitude',
                              subject: bankFilterSubject as 'quantitative-mathematics' | 'design-aptitude',
                              topicTitle: value,
                            });
                            return;
                          }
                          const selectedChapter = bankChapterOptions.find((item) => item.value === bankFilterChapterKey);
                          if (!selectedChapter || !authToken) return;
                          const selectedPart = selectedChapter.part === 'part1' || selectedChapter.part === 'part2'
                            ? selectedChapter.part
                            : isBankPartSelectionSubject
                              ? (bankFilterPart === 'part2' ? 'part2' : bankFilterPart === 'part1' ? 'part1' : 'part1')
                              : '';
                          void handleSectionSelection({
                            subject: bankFilterSubject as SubjectKey,
                            part: selectedPart,
                            chapterTitle: selectedChapter.chapterTitle,
                            sectionTitle: value,
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select section/topic" /></SelectTrigger>
                        <SelectContent>
                          {bankSectionOptions.map((item) => (
                            <SelectItem key={`bank-section-${item}`} value={item}>{item}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Input
                    placeholder="Search MCQs in this view"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={!selectedHierarchy}
                  />
                  <div className="space-y-2 max-h-[460px] overflow-auto">
                    {selectedHierarchy ? filteredMcqs.map((item, index) => {
                      const draft = bankEditDrafts[item.id] || createEditableBankMcq(item);
                      const isSaving = Boolean(bankSavingIds[item.id]);

                      return (
                        <div key={item.id} className="space-y-3 rounded-lg border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">MCQ #{index + 1}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.subject} • {item.part || '-'} • {item.chapter || '-'} • {item.section || item.topic}
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Question Type</Label>
                            <div className="inline-flex overflow-hidden rounded-md border">
                              <button
                                type="button"
                                onClick={() => updateBankEditDraft(item.id, (current) => ({ ...current, questionType: 'text' }))}
                                className={`px-3 py-1.5 text-xs ${draft.questionType !== 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                              >
                                Text
                              </button>
                              <button
                                type="button"
                                onClick={() => updateBankEditDraft(item.id, (current) => ({ ...current, questionType: 'image' }))}
                                className={`px-3 py-1.5 text-xs ${draft.questionType === 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                              >
                                Image
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor={`bank-question-${normalizeMathInputId(item.id)}`}>Question Text</Label>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => insertMathSymbolToField(`bank-question-${normalizeMathInputId(item.id)}`)}
                              >
                                Insert Math Symbol
                              </Button>
                            </div>
                            <MathLiveInput
                              id={`bank-question-${normalizeMathInputId(item.id)}`}
                              value={draft.question}
                              placeholder="Question text"
                              className="min-h-[84px]"
                              onValueChange={(nextValue) => updateBankEditDraft(item.id, (current) => ({ ...current, question: nextValue }))}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Question Image</Label>
                            {normalizeMcqImageSrc(draft.questionImage?.dataUrl) ? (
                              <img
                                src={normalizeMcqImageSrc(draft.questionImage?.dataUrl)}
                                alt="Current question image"
                                className="edit-image-preview"
                              />
                            ) : (
                              <p className="text-xs text-muted-foreground">No image uploaded</p>
                            )}
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (!file) return;
                                if (!isSupportedMcqImage(file)) {
                                  toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                  toast.error('Image is too large. Maximum size is 5 MB.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                void fileToMcqImage(file)
                                  .then((image) => updateBankEditDraft(item.id, (current) => ({ ...current, questionImage: image })))
                                  .catch(() => toast.error('Could not read selected image.'));
                                e.currentTarget.value = '';
                              }}
                            />
                            {draft.questionImage ? (
                              <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                <span>{draft.questionImage.name}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateBankEditDraft(item.id, (current) => ({ ...current, questionImage: null }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label>Options (A-E)</Label>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => updateBankEditDraft(item.id, (current) => {
                                  if (current.optionMedia.length >= 5) return current;
                                  const nextKey = String.fromCharCode(65 + current.optionMedia.length);
                                  return {
                                    ...current,
                                    optionMedia: [...current.optionMedia, { key: nextKey, text: '', image: null }],
                                    optionTypes: [...current.optionTypes, 'text'],
                                  };
                                })}
                                disabled={draft.optionMedia.length >= 5}
                              >
                                Add Option
                              </Button>
                            </div>

                            <div className="space-y-2">
                              {draft.optionMedia.map((option, optionIdx) => (
                                <div key={`${item.id}-option-${option.key}-${optionIdx}`} className="space-y-1.5 rounded-md border p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Label>Option {option.key}</Label>
                                    <div className="inline-flex overflow-hidden rounded-md border">
                                      <button
                                        type="button"
                                        onClick={() => updateBankEditDraft(item.id, (current) => {
                                          const optionTypes = [...current.optionTypes];
                                          optionTypes[optionIdx] = 'text';
                                          return { ...current, optionTypes };
                                        })}
                                        className={`px-3 py-1.5 text-xs ${(draft.optionTypes[optionIdx] || 'text') !== 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                                      >
                                        Text
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateBankEditDraft(item.id, (current) => {
                                          const optionTypes = [...current.optionTypes];
                                          optionTypes[optionIdx] = 'image';
                                          return { ...current, optionTypes };
                                        })}
                                        className={`px-3 py-1.5 text-xs ${(draft.optionTypes[optionIdx] || 'text') === 'image' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}
                                      >
                                        Image
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <Label htmlFor={`bank-option-${normalizeMathInputId(item.id)}-${normalizeMathInputId(option.key)}`}>Option {option.key}</Label>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => insertMathSymbolToField(`bank-option-${normalizeMathInputId(item.id)}-${normalizeMathInputId(option.key)}`)}
                                      >
                                        Insert Math Symbol
                                      </Button>
                                    </div>
                                    <MathLiveInput
                                      id={`bank-option-${normalizeMathInputId(item.id)}-${normalizeMathInputId(option.key)}`}
                                      value={option.text}
                                      placeholder={`Option ${option.key} text`}
                                      onValueChange={(nextValue) => {
                                        updateBankEditDraft(item.id, (current) => {
                                          const optionMedia = [...current.optionMedia];
                                          optionMedia[optionIdx] = { ...optionMedia[optionIdx], text: nextValue };
                                          return { ...current, optionMedia };
                                        });
                                      }}
                                    />
                                  </div>

                                  <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null;
                                      if (!file) return;
                                      if (!isSupportedMcqImage(file)) {
                                        toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
                                        e.currentTarget.value = '';
                                        return;
                                      }
                                      if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                        toast.error('Image is too large. Maximum size is 5 MB.');
                                        e.currentTarget.value = '';
                                        return;
                                      }
                                      void fileToMcqImage(file)
                                        .then((image) => {
                                          updateBankEditDraft(item.id, (current) => {
                                            const optionMedia = [...current.optionMedia];
                                            optionMedia[optionIdx] = { ...optionMedia[optionIdx], image };
                                            return { ...current, optionMedia };
                                          });
                                        })
                                        .catch(() => toast.error('Could not read selected image.'));
                                      e.currentTarget.value = '';
                                    }}
                                  />

                                  {normalizeMcqImageSrc(option.image?.dataUrl) ? (
                                    <img
                                      src={normalizeMcqImageSrc(option.image?.dataUrl)}
                                      alt={`Current option ${option.key} image`}
                                      className="edit-image-preview"
                                    />
                                  ) : (
                                    <p className="text-xs text-muted-foreground">No option image uploaded</p>
                                  )}

                                  <div className="flex items-center justify-between gap-2">
                                    {option.image ? (
                                      <div className="rounded border bg-muted/20 px-2 py-1 text-xs">Image: {option.image.name}</div>
                                    ) : <div className="text-xs text-muted-foreground">No option image selected</div>}
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateBankEditDraft(item.id, (current) => {
                                          const optionMedia = [...current.optionMedia];
                                          optionMedia[optionIdx] = { ...optionMedia[optionIdx], image: null };
                                          return { ...current, optionMedia };
                                        })}
                                        disabled={!option.image}
                                      >
                                        Remove Image
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateBankEditDraft(item.id, (current) => {
                                          if (current.optionMedia.length <= 4) return current;
                                          const optionMedia = [...current.optionMedia];
                                          const optionTypes = [...current.optionTypes];
                                          optionMedia.splice(optionIdx, 1);
                                          optionTypes.splice(optionIdx, 1);
                                          return {
                                            ...current,
                                            optionMedia: optionMedia.map((entry, idx) => ({ ...entry, key: String.fromCharCode(65 + idx) })),
                                            optionTypes,
                                          };
                                        })}
                                        disabled={draft.optionMedia.length <= 4}
                                      >
                                        Remove Option
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label>Correct Answer</Label>
                              <Select
                                value={draft.answer}
                                onValueChange={(value) => updateBankEditDraft(item.id, (current) => ({ ...current, answer: value }))}
                              >
                                <SelectTrigger><SelectValue placeholder="Select correct answer" /></SelectTrigger>
                                <SelectContent>
                                  {draft.optionMedia.map((option) => (
                                    <SelectItem key={`${item.id}-answer-${option.key}`} value={option.key}>{option.key}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Difficulty</Label>
                              <Select
                                value={draft.difficulty}
                                onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => updateBankEditDraft(item.id, (current) => ({ ...current, difficulty: value }))}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Easy">Easy</SelectItem>
                                  <SelectItem value="Medium">Medium</SelectItem>
                                  <SelectItem value="Hard">Hard</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <Label>Explanation</Label>
                            <Textarea
                              value={draft.explanationText}
                              onChange={(e) => updateBankEditDraft(item.id, (current) => ({ ...current, explanationText: e.target.value }))}
                              className="min-h-[90px]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Explanation Image</Label>
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (!file) return;
                                if (!isSupportedMcqImage(file)) {
                                  toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                  toast.error('Image is too large. Maximum size is 5 MB.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                void fileToMcqImage(file)
                                  .then((image) => updateBankEditDraft(item.id, (current) => ({ ...current, explanationImage: image })))
                                  .catch(() => toast.error('Could not read selected image.'));
                                e.currentTarget.value = '';
                              }}
                            />
                            {draft.explanationImage ? (
                              <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                <span>{draft.explanationImage.name}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateBankEditDraft(item.id, (current) => ({ ...current, explanationImage: null }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-1.5">
                            <Label>Short Trick</Label>
                            <Textarea
                              value={draft.shortTrickText}
                              onChange={(e) => updateBankEditDraft(item.id, (current) => ({ ...current, shortTrickText: e.target.value }))}
                              className="min-h-[80px]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Short Trick Image</Label>
                            <Input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                if (!file) return;
                                if (!isSupportedMcqImage(file)) {
                                  toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                  toast.error('Image is too large. Maximum size is 5 MB.');
                                  e.currentTarget.value = '';
                                  return;
                                }
                                void fileToMcqImage(file)
                                  .then((image) => updateBankEditDraft(item.id, (current) => ({ ...current, shortTrickImage: image })))
                                  .catch(() => toast.error('Could not read selected image.'));
                                e.currentTarget.value = '';
                              }}
                            />
                            {draft.shortTrickImage ? (
                              <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                <span>{draft.shortTrickImage.name}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateBankEditDraft(item.id, (current) => ({ ...current, shortTrickImage: null }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => openBankMcqPreview(draft)}
                            >
                              Preview MCQ
                            </Button>
                            <Button
                              type="button"
                              onClick={() => void saveBankMcqChanges(item.id)}
                              disabled={isSaving}
                            >
                              {isSaving ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Saving...
                                </>
                              ) : 'Save Changes'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => void deleteMcq(item.id)}>Delete</Button>
                          </div>
                        </div>
                      );
                    }) : null}
                    {!selectedHierarchy ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        Section/topic not selected yet. Use the filters above first.
                      </div>
                    ) : null}
                    {selectedHierarchy && !filteredMcqs.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No MCQs in this section yet.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Assign Plan Directly (Admin)</CardTitle>
              <CardDescription>Activate or update a subscription by user email without token or user-side request.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="assign-plan-email">User Email</Label>
                <Input
                  id="assign-plan-email"
                  type="email"
                  value={assignPlanForm.email}
                  onChange={(e) => setAssignPlanForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="student@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="assign-plan-id">Plan</Label>
                <Select
                  value={assignPlanForm.planId}
                  onValueChange={(value) => setAssignPlanForm((prev) => ({ ...prev, planId: value }))}
                >
                  <SelectTrigger id="assign-plan-id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(subscriptionOverview?.plans || []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                    ))}
                    {!(subscriptionOverview?.plans || []).length ? <SelectItem value="basic_monthly">Basic Plan</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="assign-plan-status">Status</Label>
                <Select
                  value={assignPlanForm.status}
                  onValueChange={(value) => setAssignPlanForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger id="assign-plan-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AlertDialog open={isAssignPlanConfirmOpen} onOpenChange={setIsAssignPlanConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      isAssigningPlan
                      || !assignPlanForm.email.trim()
                      || !assignPlanForm.planId.trim()
                    }
                  >
                    {isAssigningPlan ? 'Assigning...' : 'Assign Plan'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Subscription Assignment</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will overwrite the current subscription for {assignPlanForm.email.trim() || 'this user'}.
                      New plan: {selectedDirectAssignPlanName} ({assignPlanForm.status}).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isAssigningPlan}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isAssigningPlan}
                      onClick={() => {
                        setIsAssignPlanConfirmOpen(false);
                        void assignSubscriptionByEmail();
                      }}
                    >
                      Confirm Assign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscription Plans</CardTitle>
              <CardDescription>Current plan catalog and daily limits</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(subscriptionOverview?.plans || []).map((plan) => (
                <div key={plan.id} className="rounded-lg border p-3">
                  <p className="text-sm">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.tier} - {plan.billingCycle}</p>
                  <p className="text-xs text-muted-foreground">PKR {plan.pricePkr} | Daily limit: {plan.dailyAiLimit}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Subscriptions</CardTitle>
              <CardDescription>Filter and update user subscription status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="subscription-status-filter">Status</Label>
                <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                  <SelectTrigger id="subscription-status-filter" className="w-full sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-auto">
                {subscriptionUsers.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm">{entry.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {[entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'No name'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={entry.subscription.isActive ? 'default' : 'outline'}>
                          {entry.subscription.status || 'inactive'}
                        </Badge>
                        <Badge variant="outline">{entry.subscription.planName || entry.subscription.planId || 'No plan'}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      <Button
                        size="sm"
                        onClick={() => void updateUserSubscription(entry.id, 'basic_monthly', 'active')}
                      >
                        Activate Basic
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void updateUserSubscription(entry.id, 'pro_monthly', 'active')}
                      >
                        Activate Pro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateUserSubscription(entry.id, entry.subscription.planId || 'basic_monthly', 'inactive')}
                      >
                        Set Inactive
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Mentor Usage (14 Days)</CardTitle>
              <CardDescription>Combined chat and solver activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-auto">
              {(subscriptionOverview?.dailyUsage || []).map((item) => (
                <div key={item.day} className="rounded-lg border p-3 text-sm">
                  <p>{item.day}</p>
                  <p className="text-xs text-muted-foreground">
                    Chat: {item.chatCount} | Solver: {item.solverCount} | Tokens: {item.tokenConsumed}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="practice-board" className="space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
            <Card className="min-w-0">
              <CardHeader
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setIsPracticeEditorOpen((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsPracticeEditorOpen((prev) => !prev);
                  }
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Practice Board Question Editor</CardTitle>
                    <CardDescription>
                      Add conceptual questions using text, optional file uploads, or both.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={isPracticeEditorOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPracticeEditorOpen((prev) => !prev);
                    }}
                  >
                    {isPracticeEditorOpen ? 'Close Practice Board Editor' : 'Open Practice Board Editor'}
                  </Button>
                </div>
              </CardHeader>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isPracticeEditorOpen ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0'}`}
              >
              <CardContent className="space-y-3 border-t border-slate-200/60 pt-4 dark:border-white/10">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Select
                      value={practiceForm.subject}
                      onValueChange={(value) => setPracticeForm((prev) => ({ ...prev, subject: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mathematics">Mathematics</SelectItem>
                        <SelectItem value="physics">Physics</SelectItem>
                        <SelectItem value="chemistry">Chemistry</SelectItem>
                        <SelectItem value="biology">Biology</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Difficulty</Label>
                    <Select
                      value={practiceForm.difficulty}
                      onValueChange={(value) => setPracticeForm((prev) => ({ ...prev, difficulty: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Question Text</Label>
                  <Textarea
                    value={practiceForm.questionText}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, questionText: e.target.value }))}
                    className="min-h-[120px]"
                    placeholder="Type the conceptual problem statement..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Upload Question File (optional)</Label>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setPracticeQuestionUpload(e.target.files?.[0] || null)}
                  />
                  {practiceQuestionUpload ? (
                    <p className="text-xs text-muted-foreground">Selected: {practiceQuestionUpload.name}</p>
                  ) : null}
                  {!practiceQuestionUpload && practiceForm.questionFile?.name ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Current file: {practiceForm.questionFile.name}</span>
                      <button
                        type="button"
                        className="text-blue-600 underline underline-offset-2"
                        onClick={() => setPracticeForm((prev) => ({ ...prev, questionFile: null }))}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label>Solution Text</Label>
                  <Textarea
                    value={practiceForm.solutionText}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, solutionText: e.target.value }))}
                    className="min-h-[120px]"
                    placeholder="Type the complete answer/explanation..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Upload Solution File (optional)</Label>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setPracticeSolutionUpload(e.target.files?.[0] || null)}
                  />
                  {practiceSolutionUpload ? (
                    <p className="text-xs text-muted-foreground">Selected: {practiceSolutionUpload.name}</p>
                  ) : null}
                  {!practiceSolutionUpload && practiceForm.solutionFile?.name ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Current file: {practiceForm.solutionFile.name}</span>
                      <button
                        type="button"
                        className="text-blue-600 underline underline-offset-2"
                        onClick={() => setPracticeForm((prev) => ({ ...prev, solutionFile: null }))}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void savePracticeQuestion()}>
                    {practiceForm.id ? 'Update' : 'Add'} Practice Question
                  </Button>
                  <Button variant="outline" onClick={resetPracticeForm}>Clear</Button>
                </div>
              </CardContent>
              </div>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Practice Board Question Bank</CardTitle>
                <CardDescription>Edit or remove existing conceptual questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by subject/difficulty/question/file..."
                  value={practiceQuery}
                  onChange={(e) => setPracticeQuery(e.target.value)}
                />
                <div className="space-y-2 max-h-[760px] overflow-auto">
                  {filteredPracticeQuestions.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setPracticeForm({
                            id: item.id,
                            subject: item.subject,
                            difficulty: item.difficulty || 'Medium',
                            questionText: item.questionText || '',
                            questionFile: item.questionFile || null,
                            solutionText: item.solutionText || '',
                            solutionFile: item.solutionFile || null,
                          });
                          setPracticeQuestionUpload(null);
                          setPracticeSolutionUpload(null);
                        }}
                      >
                        <p className="line-clamp-2 text-sm">{item.questionText || '(File-based question)'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.subject} • {item.difficulty}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Question file: {item.questionFile?.name || 'None'} | Solution file: {item.solutionFile?.name || 'None'}
                        </p>
                      </button>
                      <div className="mt-2 flex justify-end">
                        <Button variant="destructive" size="sm" onClick={() => void deletePracticeQuestion(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!filteredPracticeQuestions.length ? (
                    <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                      No practice board questions found.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Question Submissions</CardTitle>
              <CardDescription>
                Review community-submitted questions, then approve or reject each submission with feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-medium">Submission Policy</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Max submissions/day</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={contributionPolicy.maxSubmissionsPerDay}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxSubmissionsPerDay: Number(e.target.value) || prev.maxSubmissionsPerDay }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max files/submission</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={contributionPolicy.maxFilesPerSubmission}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxFilesPerSubmission: Number(e.target.value) || prev.maxFilesPerSubmission }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max file size (bytes)</Label>
                    <Input
                      type="number"
                      min={65536}
                      max={10485760}
                      value={contributionPolicy.maxFileSizeBytes}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxFileSizeBytes: Number(e.target.value) || prev.maxFileSizeBytes }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Block duration (minutes)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={10080}
                      value={contributionPolicy.blockDurationMinutes}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, blockDurationMinutes: Number(e.target.value) || prev.blockDurationMinutes }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Allowed types are fixed: JPG, PNG, PDF, DOC, DOCX.</p>
                  <Button size="sm" variant="outline" onClick={() => void saveContributionPolicy()}>Save Policy</Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={submissionStatusFilter} onValueChange={setSubmissionStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select value={submissionSubjectFilter} onValueChange={setSubmissionSubjectFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subjects</SelectItem>
                      {submissionSubjects.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Search</Label>
                  <Input
                    value={submissionQuery}
                    onChange={(e) => setSubmissionQuery(e.target.value)}
                    placeholder="Search by text, subject, submitter, or notes"
                  />
                </div>
              </div>

              <div className="space-y-3 max-h-[760px] overflow-auto">
                {filteredQuestionSubmissions.map((item) => {
                  const isCollapsedToSummary = Boolean(collapsedReviewedSubmissionIds[item.id]) && item.status !== 'pending';

                  return (
                    <div key={item.id} className="rounded-lg border p-3 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{item.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            Submitted by {item.submittedByName || 'Anonymous'}
                            {item.submittedByEmail ? ` (${item.submittedByEmail})` : ''}
                            {item.submittedByUserId ? ` • UserId: ${item.submittedByUserId}` : ''}
                            {!item.submittedByUserId && item.actorKey ? ` • Identifier: ${item.actorKey}` : ''}
                            {item.createdAt ? ` • ${new Date(item.createdAt).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={item.status === 'pending' ? 'default' : 'outline'}>{item.status}</Badge>
                          <Badge variant="outline">Moderation: {item.moderation?.result || 'approved'}</Badge>
                          {item.queuedForBank ? <Badge variant="outline">Queued for Bank</Badge> : null}
                        </div>
                      </div>

                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsedToSummary ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}
                      >
                        <div className="rounded-md border border-emerald-200/60 bg-emerald-50/40 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{item.submittedByName || 'Anonymous'}</p>
                            <Badge className={item.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}>
                              {item.status === 'approved' ? 'Approved' : 'Rejected'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.submittedByEmail || (item.submittedByUserId ? `UserId: ${item.submittedByUserId}` : item.actorKey || 'No identifier')}
                            {item.reviewedAt ? ` • Reviewed ${new Date(item.reviewedAt).toLocaleString()}` : ''}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsedToSummary ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[2600px] opacity-100'}`}
                      >
                        <div className="space-y-3">
                          {item.moderation?.reasons?.length ? (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                              <p className="font-medium">AI moderation reasons</p>
                              <p>{item.moderation.reasons.join(' ')}</p>
                            </div>
                          ) : null}

                          <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                            {item.questionText || 'No typed text provided. See attached files below.'}
                          </div>

                          {item.questionDescription ? (
                            <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Question Description</p>
                              {item.questionDescription}
                            </div>
                          ) : null}

                          {item.questionSource ? (
                            <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Source</p>
                              {item.questionSource}
                            </div>
                          ) : null}

                          {item.submissionReason ? (
                            <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                              <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Reason for Submission</p>
                              {item.submissionReason}
                            </div>
                          ) : null}

                          {item.attachments?.length ? (
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">Attachments</p>
                              {item.attachments.map((file) => (
                                <div
                                  key={`${item.id}-${file.name}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                                >
                                  <span className="min-w-0 truncate">{file.name} • {file.mimeType}</span>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (!openDataUrlPreview(file.dataUrl)) {
                                          toast.error('Could not open attachment preview.');
                                        }
                                      }}
                                    >
                                      View
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (!downloadDataUrlFile(file.dataUrl, file.name || 'attachment')) {
                                          toast.error('Could not download attachment.');
                                        }
                                      }}
                                    >
                                      Download
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-1.5">
                            <Label>Review Notes (required for rejection)</Label>
                            <Textarea
                              value={Object.prototype.hasOwnProperty.call(submissionReviewNotes, item.id)
                                ? submissionReviewNotes[item.id]
                                : (item.reviewNotes || '')}
                              onChange={(e) => setSubmissionReviewNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              className="min-h-[90px]"
                              placeholder="Add a short explanation, especially when rejecting."
                            />
                            {item.reviewedByEmail || item.reviewedAt ? (
                              <p className="text-xs text-muted-foreground">
                                Last review: {item.reviewedByEmail || 'Admin'}
                                {item.reviewedAt ? ` • ${new Date(item.reviewedAt).toLocaleString()}` : ''}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => void reviewQuestionSubmission(item.id, 'approved')}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => void reviewQuestionSubmission(item.id, 'rejected')}>Reject</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!filteredQuestionSubmissions.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No submissions found for current filters.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community-moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Community Safety Reports</CardTitle>
              <CardDescription>
                Review flagged private chats, then block harmful users or dismiss false reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 max-h-[760px] overflow-auto">
                {communityReports.map((report) => (
                  <div key={report.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Report #{report.id.slice(-6)}</p>
                        <p className="text-xs text-muted-foreground">
                          Reporter: {report.reporterUserId} • Reported: {report.reportedUserId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Unknown time'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={report.status === 'open' ? 'default' : 'outline'}>{report.status}</Badge>
                        <Badge variant="outline">{report.moderation?.result || 'pending'}</Badge>
                      </div>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Reporter reason</p>
                      {report.reason || 'No reason provided.'}
                    </div>

                    {report.moderation?.reasons?.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="mb-1 text-xs uppercase tracking-wide">Auto moderation findings</p>
                        <p>{report.moderation.reasons.join(' ')}</p>
                      </div>
                    ) : null}

                    <div className="rounded-md border bg-white p-3">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Chat snapshot</p>
                      <div className="space-y-2 max-h-[220px] overflow-auto">
                        {(report.chatSnapshot || []).map((row, idx) => (
                          <div key={`${report.id}-${idx}`} className="rounded border px-2 py-1.5 text-xs">
                            <p className="text-muted-foreground">{row.senderUserId}</p>
                            <p className="whitespace-pre-wrap">{row.text}</p>
                          </div>
                        ))}
                        {!report.chatSnapshot?.length ? (
                          <p className="text-xs text-muted-foreground">No snapshot available.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Admin Notes</Label>
                      <Textarea
                        value={communityReportNotes[report.id] || ''}
                        onChange={(e) => setCommunityReportNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                        placeholder="Add your moderation note (optional but recommended)."
                        className="min-h-[80px]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void reviewCommunityReport(report, 'block')}>Block User</Button>
                      <Button size="sm" variant="outline" onClick={() => void reviewCommunityReport(report, 'dismiss')}>Dismiss</Button>
                    </div>
                  </div>
                ))}

                {!communityReports.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No community reports found.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
        </div>
      </main>

      {gestureImageEditor.isOpen ? (
        <div className="admin-gesture-editor fixed inset-0 z-[80] bg-black/95 text-white">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:flex-nowrap">
              <Button type="button" size="sm" variant="outline" className="min-h-11 px-4" onClick={closeGestureImageEditor} disabled={isApplyingGestureCrop}>Cancel</Button>
              <p className="grow text-center text-xs text-white/80 sm:grow-0">Drag, resize, pinch to zoom, rotate</p>
              <Button type="button" size="sm" className="min-h-11 px-4" onClick={() => void applyGestureImageEditor()} disabled={isApplyingGestureCrop}>
                {isApplyingGestureCrop ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Using...
                  </>
                ) : 'Use Photo'}
              </Button>
            </div>

            <div
              ref={gestureSurfaceRef}
              className="relative flex-1 overflow-hidden touch-none"
              style={{ touchAction: 'none' }}
              onPointerDown={beginImagePointerGesture}
            >
              <img
                src={gestureImageEditor.sourceDataUrl}
                alt="Edit preview"
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: `${gestureImageEditor.naturalWidth}px`,
                  height: `${gestureImageEditor.naturalHeight}px`,
                  willChange: 'transform',
                  transformOrigin: 'center center',
                  transform: `translate(-50%, -50%) translate(${gestureImageEditor.translateX}px, ${gestureImageEditor.translateY}px) scale(${Math.min(
                    gestureImageEditor.viewportWidth / gestureImageEditor.naturalWidth,
                    gestureImageEditor.viewportHeight / gestureImageEditor.naturalHeight,
                  ) * gestureImageEditor.zoom}) rotate(${gestureImageEditor.rotation}rad)`,
                }}
              />

              <div
                className="absolute border-2 border-cyan-300"
                style={{
                  left: `${gestureImageEditor.crop.x}px`,
                  top: `${gestureImageEditor.crop.y}px`,
                  width: `${gestureImageEditor.crop.width}px`,
                  height: `${gestureImageEditor.crop.height}px`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginCropDrag(event, 'move');
                }}
              >
                <div className="pointer-events-none absolute inset-0 border border-white/75" />

                <div className="absolute left-1/2 top-0 h-10 w-10 -translate-x-1/2 -translate-y-1/2" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'n'); }}>
                  <div className="mx-auto h-6 w-6 rounded-full border-2 border-white bg-cyan-400" />
                </div>
                <div className="absolute left-1/2 bottom-0 h-10 w-10 -translate-x-1/2 translate-y-1/2" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 's'); }}>
                  <div className="mx-auto h-6 w-6 rounded-full border-2 border-white bg-cyan-400" />
                </div>
                <div className="absolute left-0 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'w'); }}>
                  <div className="my-auto h-6 w-6 rounded-full border-2 border-white bg-cyan-400" />
                </div>
                <div className="absolute right-0 top-1/2 h-10 w-10 translate-x-1/2 -translate-y-1/2" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'e'); }}>
                  <div className="my-auto h-6 w-6 rounded-full border-2 border-white bg-cyan-400" />
                </div>

                <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 border-white bg-cyan-400" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'nw'); }} />
                <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full border-2 border-white bg-cyan-400" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'ne'); }} />
                <div className="absolute -left-3 -bottom-3 h-6 w-6 rounded-full border-2 border-white bg-cyan-400" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'sw'); }} />
                <div className="absolute -right-3 -bottom-3 h-6 w-6 rounded-full border-2 border-white bg-cyan-400" onPointerDown={(event) => { event.stopPropagation(); beginCropDrag(event, 'se'); }} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br ${tone} shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-300 dark:border-white/20 dark:shadow-[0_18px_40px_rgba(4,10,38,0.5)] ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_24px_44px_rgba(15,23,42,0.16)] dark:hover:shadow-[0_26px_50px_rgba(2,8,32,0.62)]' : ''}`}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.42),transparent_45%)] opacity-90 dark:bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent_45%)] dark:opacity-80" />
      <CardContent className="relative pt-4">
        <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300/70 bg-white/70 dark:border-white/25 dark:bg-white/15">
          <Icon className="h-4 w-4 text-slate-800 dark:text-white" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-100/90">{title}</p>
        <p className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-300/55 dark:bg-white/20">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 dark:from-cyan-300 dark:via-violet-300 dark:to-pink-300 transition-all duration-500 group-hover:w-[82%]" />
        </div>
      </CardContent>
    </Card>
  );
}
