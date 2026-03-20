import crypto from 'node:crypto';

function toSafeSlug(value, fallback = 'na', maxLength = 24) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[img:[^\]]+\]\]/gi, ' ')
    .replace(/\[\[imgrow:[^\]]+\]\]/gi, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  const candidate = normalized || fallback;
  return candidate.slice(0, Math.max(4, maxLength));
}

export function normalizeMcqIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[\[img:[^\]]+\]\]/gi, ' ')
    .replace(/\[\[imgrow:[^\]]+\]\]/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionList(options) {
  return (Array.isArray(options) ? options : [])
    .slice(0, 4)
    .map((item) => normalizeMcqIdentityText(item))
    .filter(Boolean);
}

function buildMcqFingerprintSource(mcq = {}) {
  const question = normalizeMcqIdentityText(mcq.question || '');
  const options = normalizeOptionList(mcq.options || []);
  return [question, ...options].join('||');
}

export function buildMcqContentFingerprint(mcq = {}) {
  const source = buildMcqFingerprintSource(mcq);
  if (!source) return '';
  return crypto.createHash('sha1').update(source).digest('hex');
}

export function buildStructuredMcqIdBase(mcq = {}) {
  const subject = toSafeSlug(mcq.subject || 'general', 'general', 16);
  const part = toSafeSlug(mcq.part || '', '', 8);
  const chapter = toSafeSlug(mcq.chapter || mcq.topic || mcq.section || 'general', 'general', 18);
  const section = toSafeSlug(mcq.section || mcq.topic || mcq.chapter || 'topic', 'topic', 18);
  const fingerprint = buildMcqContentFingerprint(mcq).slice(0, 12) || '000000000000';

  const segments = [subject];
  if (part) segments.push(part);
  segments.push(chapter, section, fingerprint);
  return segments.join('-');
}

export async function resolveUniqueMcqExternalId({
  model,
  mcq,
  excludeId = null,
  usedExternalIds = null,
  maxAttempts = 500,
}) {
  const base = buildStructuredMcqIdBase(mcq);
  const availableSet = usedExternalIds instanceof Set ? usedExternalIds : null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;

    if (availableSet && availableSet.has(candidate)) {
      continue;
    }

    if (!model) {
      if (availableSet) availableSet.add(candidate);
      return candidate;
    }

    const conflict = await model.exists({
      externalId: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });

    if (!conflict) {
      if (availableSet) availableSet.add(candidate);
      return candidate;
    }
  }

  throw new Error('Could not allocate a unique MCQ externalId after many attempts.');
}
