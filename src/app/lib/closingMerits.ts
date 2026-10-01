import { NET_PROGRAMS_BY_CATEGORY, type NetProgramCategoryKey } from './netPrograms';

export interface ClosingMeritProgram {
  id: string;
  name: string;
  institution: string;
  location: string;
  categoryKey: string;
  categoryLabel: string;
  closingMerit: number | null;
}

const CATEGORY_ORDER: NetProgramCategoryKey[] = [
  'engineering',
  'computing',
  'business',
  'architecture',
  'sciences',
  'applied',
];

/** Reference numbers already shown in the calculator, matched to the programs page. */
const KNOWN_CLOSING_MERITS: Record<string, number> = {
  'BS Computer Science|SEECS': 86.5,
  'Electrical Engineering|SEECS': 84.2,
  'BS Artificial Intelligence|SEECS': 87.1,
  'Software Engineering|MCS': 85.8,
  'Mechanical Engineering|SMME': 82.5,
  'Civil Engineering|SCEE': 78.9,
  'BBA|NBS': 76.4,
  'BS Data Science|SEECS': 86.2,
};

export function catalogClosingMerits(): ClosingMeritProgram[] {
  const items: ClosingMeritProgram[] = [];

  CATEGORY_ORDER.forEach((key) => {
    const category = NET_PROGRAMS_BY_CATEGORY[key];
    category.programs.forEach((program, index) => {
      const merit = KNOWN_CLOSING_MERITS[`${program.name}|${program.institution}`];
      items.push({
        id: `catalog-${key}-${index}`,
        name: program.name,
        institution: program.institution,
        location: program.location,
        categoryKey: key,
        categoryLabel: category.label,
        closingMerit: Number.isFinite(merit) ? merit : null,
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

  return {
    position: met.length === 0 ? listed.length : above.length + 1,
    listed: listed.length,
    met: met.length,
    bestMet: met[0] ?? null,
    nextAbove: above[0] ?? null,
  };
}

export function meritPositionLabel(standing: MeritListStanding | null): string {
  if (!standing) return '—';
  if (standing.met === 0) return `Below ${standing.listed}`;
  return `${standing.position} of ${standing.listed}`;
}
