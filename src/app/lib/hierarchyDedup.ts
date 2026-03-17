export function normalizeHierarchyLabel(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function dedupeNormalizedStrings(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  (values || []).forEach((value) => {
    const label = String(value || '').trim();
    if (!label) return;
    const key = normalizeHierarchyLabel(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(label);
  });

  return deduped;
}
