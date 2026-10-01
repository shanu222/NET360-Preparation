import { NET_PROGRAMS_BY_CATEGORY, type NetProgramCategoryKey } from './netPrograms';
import documentRows from './nust2026ClosingMerits.json';

export type ClosingMeritStatus = 'real' | 'estimated';

export interface ClosingMeritProgram {
  id: string;
  name: string;
  institution: string;
  location: string;
  categoryKey: string;
  categoryLabel: string;
  closingMerit: number | null;
  meritPosition: number | null;
  meritStatus: ClosingMeritStatus;
}

export const DEFAULT_CLOSING_MERIT_YEAR = 2026;

type DocumentRow = [string, string, number, number, ClosingMeritStatus];

function schoolCode(institution: string) {
  return String(institution || '').split(/[·/|,]/)[0].trim().toUpperCase();
}

export function documentMeritKey(name: string, institution: string) {
  return `${name.trim().toLowerCase()}|${schoolCode(institution)}`;
}

const DOCUMENT_BY_KEY = new Map(
  (documentRows as DocumentRow[]).map((row) => [
    documentMeritKey(row[0], row[1]),
    { meritPosition: row[2], closingMerit: row[3], meritStatus: row[4] },
  ]),
);

export function documentMeritFor(name: string, institution: string) {
  return DOCUMENT_BY_KEY.get(documentMeritKey(name, institution)) ?? null;
}

const CATEGORY_ORDER: NetProgramCategoryKey[] = [
  'engineering',
  'computing',
  'business',
  'architecture',
  'sciences',
  'applied',
];

export function catalogClosingMerits(): ClosingMeritProgram[] {
  const items: ClosingMeritProgram[] = [];

  CATEGORY_ORDER.forEach((key) => {
    const category = NET_PROGRAMS_BY_CATEGORY[key];
    category.programs.forEach((program, index) => {
      const fromDocument = documentMeritFor(program.name, program.institution);
      items.push({
        id: `catalog-${key}-${index}`,
        name: program.name,
        institution: program.institution,
        location: program.location,
        categoryKey: key,
        categoryLabel: category.label,
        closingMerit: fromDocument?.closingMerit ?? null,
        meritPosition: fromDocument?.meritPosition ?? null,
        meritStatus: fromDocument?.meritStatus ?? 'estimated',
      });
    });
  });

  return items;
}

export function formatClosingMerit(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 100) / 100);
}

export interface MeritListStanding {
  position: number;
  listed: number;
  met: number;
  bestMet: ClosingMeritProgram | null;
  nextAbove: ClosingMeritProgram | null;
  estimatedPosition: number | null;
  positionBound: 'better' | 'lower' | 'within' | null;
}

/** Place an aggregate on the closing-merit list, highest cutoff first. */
export function standingOnClosingMeritList(
  aggregate: number,
  programs: ClosingMeritProgram[],
): MeritListStanding | null {
  if (!Number.isFinite(aggregate)) return null;

  const listed = programs.filter((program) => {
    const merit = Number(program.closingMerit);
    return program.closingMerit != null && Number.isFinite(merit);
  });
  if (!listed.length) return null;

  const above = listed
    .filter((program) => Number(program.closingMerit) > aggregate)
    .sort((a, b) => Number(a.closingMerit) - Number(b.closingMerit));
  const met = listed
    .filter((program) => Number(program.closingMerit) <= aggregate)
    .sort((a, b) => Number(b.closingMerit) - Number(a.closingMerit));

  const estimate = estimateMeritPosition(aggregate, programs);
  return {
    position: met.length === 0 ? listed.length : above.length + 1,
    listed: listed.length,
    met: met.length,
    bestMet: met[0] ?? null,
    nextAbove: above[0] ?? null,
    estimatedPosition: estimate?.position ?? null,
    positionBound: estimate?.bound ?? null,
  };
}

export function formatMeritPosition(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Math.round(Number(value)).toLocaleString('en-US');
}

export function meritStatusLabel(status: string | null | undefined): string {
  return status === 'real' ? 'Real' : 'Estimated';
}

function estimateMeritPosition(aggregate: number, programs: ClosingMeritProgram[]) {
  const points = programs.filter((program) => {
    const closingAggregate = Number(program.closingMerit);
    const position = Number(program.meritPosition);
    return program.closingMerit != null && program.meritPosition != null && Number.isFinite(closingAggregate) && Number.isFinite(position);
  });
  if (!points.length) return null;

  let closest = points[0];
  let closestDistance = Math.abs(Number(closest.closingMerit) - aggregate);
  points.forEach((program) => {
    const distance = Math.abs(Number(program.closingMerit) - aggregate);
    const meets = aggregate + 0.001 >= Number(program.closingMerit);
    const closestMeets = aggregate + 0.001 >= Number(closest.closingMerit);
    if (distance < closestDistance - 0.001 || (Math.abs(distance - closestDistance) < 0.001 && meets && !closestMeets)) {
      closest = program;
      closestDistance = distance;
    }
  });

  const exact = Math.abs(Number(closest.closingMerit) - aggregate) < 0.05;
  const meets = aggregate + 0.001 >= Number(closest.closingMerit);
  return {
    position: Math.round(Number(closest.meritPosition)),
    bound: exact ? 'within' as const : meets ? 'better' as const : 'lower' as const,
  };
}

export function meritPositionLabel(standing: MeritListStanding | null): string {
  if (!standing) return '—';
  if (standing.estimatedPosition != null) {
    const formatted = formatMeritPosition(standing.estimatedPosition);
    if (standing.positionBound === 'better') return `${formatted} or better`;
    if (standing.positionBound === 'lower') return `${formatted} or lower`;
    return formatted;
  }
  if (standing.met === 0) return `Below ${standing.listed}`;
  return `${standing.position} of ${standing.listed}`;
}

export function mergeClosingMeritPrograms(remote: ClosingMeritProgram[], local: ClosingMeritProgram[]): ClosingMeritProgram[] {
  const localByKey = new Map(local.map((program) => [documentMeritKey(program.name, program.institution), program]));
  return remote.map((program) => {
    const fallback = localByKey.get(documentMeritKey(program.name, program.institution));
    const remoteRecord = program as ClosingMeritProgram & { meritPosition?: number | null; meritStatus?: ClosingMeritStatus };
    return {
      ...fallback,
      ...program,
      closingMerit: program.closingMerit ?? fallback?.closingMerit ?? null,
      meritPosition: remoteRecord.meritPosition !== undefined ? remoteRecord.meritPosition : (fallback?.meritPosition ?? null),
      meritStatus: remoteRecord.meritStatus || fallback?.meritStatus || 'estimated',
    };
  });
}

function programIdentity(program: { name: string; institution: string; location: string }) {
  return `${program.name}|${program.institution}|${program.location}`.trim().toLowerCase();
}

/** Programs saved in admin that are not already on the built-in programs page. */
export function extraSharedPrograms<T extends { name: string; institution: string; location: string }>(
  existing: T[],
  shared: ClosingMeritProgram[],
  categoryKey: string,
) {
  const seen = new Set(existing.map((program) => programIdentity(program)));
  return shared
    .filter((program) => program.categoryKey === categoryKey)
    .filter((program) => program.name.trim() && program.institution.trim())
    .filter((program) => !seen.has(programIdentity(program)))
    .map((program) => ({
      name: program.name,
      institution: program.institution,
      location: program.location,
      iconKey: 'sparkles' as const,
    }));
}
