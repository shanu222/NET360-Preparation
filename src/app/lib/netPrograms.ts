import type { SubjectKey } from './mcq';

export type NetProgramCategoryKey = 'engineering' | 'computing' | 'business' | 'architecture' | 'sciences' | 'applied';

export type NetProgramIconKey =
  | 'zap'
  | 'cog'
  | 'mountain'
  | 'landmark'
  | 'sparkles'
  | 'bot'
  | 'flask'
  | 'beaker'
  | 'code'
  | 'atom'
  | 'briefcase'
  | 'building2'
  | 'ruler';

export interface NetProgramItem {
  name: string;
  institution: string;
  location: string;
  iconKey: NetProgramIconKey;
}

export interface NetProgramCategory {
  label: string;
  tag: string;
  description: string;
  programs: NetProgramItem[];
  institutions?: string[];
}

export const NET_PROGRAMS_BY_CATEGORY: Record<NetProgramCategoryKey, NetProgramCategory> = {
  engineering: {
    label: 'Engineering Programs',
    tag: 'Engineering',
    description: 'Engineering schools and colleges across Islamabad, Rawalpindi, Risalpur, Karachi, and Quetta',
    programs: [
      { name: 'Electrical Engineering', institution: 'SEECS', location: 'Main Campus, Islamabad', iconKey: 'zap' },
      { name: 'Mechanical Engineering', institution: 'SMME', location: 'Main Campus, Islamabad', iconKey: 'cog' },
      { name: 'Aerospace Engineering', institution: 'SMME', location: 'Main Campus, Islamabad', iconKey: 'mountain' },
      { name: 'Civil Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', iconKey: 'landmark' },
      { name: 'Environmental Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', iconKey: 'sparkles' },
      { name: 'Geoinformatics Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', iconKey: 'bot' },
      { name: 'Chemical Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', iconKey: 'flask' },
      { name: 'Metallurgy & Materials Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', iconKey: 'beaker' },
      { name: 'Materials Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', iconKey: 'beaker' },
      { name: 'Industrial Engineering', institution: 'SMME', location: 'Main Campus, Islamabad', iconKey: 'cog' },
      { name: 'Petroleum Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', iconKey: 'flask' },
      { name: 'Mechanical Engineering', institution: 'CEME', location: 'Rawalpindi', iconKey: 'cog' },
      { name: 'Electrical Engineering', institution: 'CEME', location: 'Rawalpindi', iconKey: 'zap' },
      { name: 'Mechatronics Engineering', institution: 'CEME', location: 'Rawalpindi', iconKey: 'bot' },
      { name: 'Civil Engineering', institution: 'MCE', location: 'Risalpur', iconKey: 'landmark' },
      { name: 'Aerospace Engineering', institution: 'CAE', location: 'Risalpur', iconKey: 'mountain' },
      { name: 'Avionics Engineering', institution: 'CAE', location: 'Risalpur', iconKey: 'sparkles' },
      { name: 'Electrical Engineering', institution: 'PNEC', location: 'Karachi', iconKey: 'zap' },
      { name: 'Mechanical Engineering', institution: 'PNEC', location: 'Karachi', iconKey: 'cog' },
      { name: 'Naval Architecture & Marine Engineering', institution: 'PNEC', location: 'Karachi', iconKey: 'mountain' },
      { name: 'Civil Engineering', institution: 'NBC', location: 'Quetta', iconKey: 'landmark' },
    ],
    institutions: ['SEECS', 'SMME', 'SCEE', 'SCME', 'CEME', 'MCE', 'CAE', 'PNEC', 'NBC'],
  },
  computing: {
    label: 'Computing Programs',
    tag: 'Computing',
    description: 'Computer science, computational intelligence, data, software, and security programs',
    programs: [
      { name: 'BS Computer Science', institution: 'SEECS', location: 'Main Campus, Islamabad', iconKey: 'code' },
      { name: 'BS Artificial Intelligence', institution: 'SEECS', location: 'Main Campus, Islamabad', iconKey: 'sparkles' },
      { name: 'BS Data Science', institution: 'SEECS', location: 'Main Campus, Islamabad', iconKey: 'atom' },
      { name: 'Computer Engineering', institution: 'CEME', location: 'Rawalpindi', iconKey: 'bot' },
      { name: 'Software Engineering', institution: 'MCS', location: 'Rawalpindi', iconKey: 'code' },
      { name: 'Information Security', institution: 'MCS', location: 'Rawalpindi', iconKey: 'sparkles' },
      { name: 'Computer Science', institution: 'PNEC', location: 'Karachi', iconKey: 'code' },
      { name: 'Computer Science', institution: 'NBC', location: 'Quetta', iconKey: 'code' },
      { name: 'Artificial Intelligence', institution: 'NBC', location: 'Quetta', iconKey: 'sparkles' },
    ],
    institutions: ['SEECS', 'CEME', 'MCS', 'PNEC', 'NBC'],
  },
  business: {
    label: 'Business, Social Sciences & Law',
    tag: 'Business/Social',
    description: 'Business, humanities, public policy, and law programs',
    programs: [
      { name: 'BBA', institution: 'NBS', location: 'Main Campus, Islamabad', iconKey: 'briefcase' },
      { name: 'MBA', institution: 'NBS', location: 'Main Campus, Islamabad', iconKey: 'briefcase' },
      { name: 'BS Economics', institution: 'S3H', location: 'Main Campus, Islamabad', iconKey: 'building2' },
      { name: 'BS Psychology', institution: 'S3H', location: 'Main Campus, Islamabad', iconKey: 'sparkles' },
      { name: 'BS Mass Communication', institution: 'S3H', location: 'Main Campus, Islamabad', iconKey: 'code' },
      { name: 'BS Liberal Arts & Humanities', institution: 'S3H', location: 'Main Campus, Islamabad', iconKey: 'landmark' },
      { name: 'BS Public Administration', institution: 'JSPPL', location: 'Main Campus, Islamabad', iconKey: 'building2' },
      { name: 'LLB', institution: 'NLS', location: 'Main Campus, Islamabad', iconKey: 'landmark' },
    ],
    institutions: ['NBS', 'S3H', 'JSPPL', 'NLS'],
  },
  architecture: {
    label: 'Architecture & Design',
    tag: 'Architecture',
    description: 'Creative programs in architecture and industrial design',
    programs: [
      { name: 'Bachelor of Architecture', institution: 'SADA', location: 'Main Campus, Islamabad', iconKey: 'ruler' },
      { name: 'Bachelor of Industrial Design', institution: 'SADA', location: 'Main Campus, Islamabad', iconKey: 'mountain' },
    ],
    institutions: ['SADA'],
  },
  sciences: {
    label: 'Natural & Interdisciplinary Sciences',
    tag: 'Sciences',
    description: 'Natural sciences and interdisciplinary biosciences programs',
    programs: [
      { name: 'BS Physics', institution: 'SNS', location: 'Main Campus, Islamabad', iconKey: 'zap' },
      { name: 'BS Mathematics', institution: 'SNS', location: 'Main Campus, Islamabad', iconKey: 'atom' },
      { name: 'BS Chemistry', institution: 'SNS', location: 'Main Campus, Islamabad', iconKey: 'flask' },
      { name: 'BS Bioinformatics', institution: 'SINES', location: 'Main Campus, Islamabad', iconKey: 'beaker' },
      { name: 'Biosciences', institution: 'SINES', location: 'Main Campus, Islamabad', iconKey: 'sparkles' },
    ],
    institutions: ['SNS', 'SINES'],
  },
  applied: {
    label: 'Applied Sciences',
    tag: 'Applied',
    description: 'Applied biosciences, agriculture, and food science programs',
    programs: [
      { name: 'BS Biotechnology', institution: 'ASAB', location: 'Main Campus, Islamabad', iconKey: 'beaker' },
      { name: 'BS Agriculture', institution: 'ASAB', location: 'Main Campus, Islamabad', iconKey: 'sparkles' },
      { name: 'BS Food Science & Technology', institution: 'ASAB', location: 'Main Campus, Islamabad', iconKey: 'flask' },
    ],
    institutions: ['ASAB'],
  },
};

export interface NetTargetProgramOption {
  value: string;
  label: string;
  category: string;
}

const CATEGORY_ORDER: NetProgramCategoryKey[] = ['engineering', 'computing', 'business', 'architecture', 'sciences', 'applied'];

const ENGINEERING_CATEGORY_ORDER: NetProgramCategoryKey[] = ['engineering', 'computing'];

export const NET_TARGET_PROGRAM_OPTIONS: NetTargetProgramOption[] = CATEGORY_ORDER.flatMap((key) => {
  const category = NET_PROGRAMS_BY_CATEGORY[key];
  const seen = new Set<string>();

  return category.programs
    .map((program) => program.name.trim())
    .filter((name) => {
      if (!name || seen.has(name.toLowerCase())) return false;
      seen.add(name.toLowerCase());
      return true;
    })
    .map((name) => ({
      value: name,
      label: name,
      category: category.tag,
    }));
});

export const NET_ENGINEERING_TARGET_PROGRAM_OPTIONS: NetTargetProgramOption[] = ENGINEERING_CATEGORY_ORDER.flatMap((key) => {
  const category = NET_PROGRAMS_BY_CATEGORY[key];
  const seen = new Set<string>();

  return category.programs
    .map((program) => program.name.trim())
    .filter((name) => {
      if (!name || seen.has(name.toLowerCase())) return false;
      seen.add(name.toLowerCase());
      return true;
    })
    .map((name) => ({
      value: name,
      label: name,
      category: category.tag,
    }));
});

type NetTrackId =
  | 'net-engineering'
  | 'net-applied-sciences'
  | 'net-business-social-sciences'
  | 'net-architecture'
  | 'net-natural-sciences';

const SUBJECTS_BY_TRACK: Record<NetTrackId, SubjectKey[]> = {
  'net-engineering': ['mathematics', 'physics', 'english'],
  'net-applied-sciences': ['biology', 'chemistry', 'english'],
  'net-business-social-sciences': ['quantitative-mathematics', 'intelligence', 'english'],
  'net-architecture': ['design-aptitude', 'mathematics', 'english'],
  'net-natural-sciences': ['mathematics', 'english'],
};

const TRACK_BY_PROGRAM_CATEGORY: Record<NetProgramCategoryKey, NetTrackId> = {
  engineering: 'net-engineering',
  computing: 'net-engineering',
  business: 'net-business-social-sciences',
  architecture: 'net-architecture',
  sciences: 'net-natural-sciences',
  applied: 'net-applied-sciences',
};

const trackIds = new Set<NetTrackId>(Object.keys(SUBJECTS_BY_TRACK) as NetTrackId[]);

const PROGRAM_CATEGORY_ALIASES: Record<NetProgramCategoryKey, string[]> = {
  engineering: [
    'engineering',
    'electrical',
    'mechanical',
    'civil',
    'chemical',
    'mechatronics',
    'avionics',
    'environmental',
    'materials',
    'metallurgy',
    'petroleum',
    'industrial',
    'aerospace',
    'geoinformatics',
    'marine',
    'naval architecture',
  ],
  computing: [
    'computer science',
    'cs',
    'it',
    'information technology',
    'software engineering',
    'computer engineering',
    'artificial intelligence',
    'ai',
    'data science',
    'information security',
    'computing',
  ],
  business: ['business', 'bba', 'mba', 'economics', 'psychology', 'mass communication', 'public administration', 'llb'],
  architecture: ['architecture', 'industrial design', 'design'],
  sciences: ['physics', 'mathematics', 'math', 'chemistry', 'bioinformatics', 'biosciences', 'natural sciences'],
  applied: ['biotechnology', 'agriculture', 'food science', 'applied sciences'],
};

export function getProgramCategoryKey(targetProgram: string): NetProgramCategoryKey | null {
  const normalizedTarget = String(targetProgram || '').trim().toLowerCase();
  if (!normalizedTarget) return null;

  for (const key of CATEGORY_ORDER) {
    const hasMatch = NET_PROGRAMS_BY_CATEGORY[key].programs.some(
      (program) => program.name.trim().toLowerCase() === normalizedTarget,
    );
    if (hasMatch) return key;
  }

  for (const key of CATEGORY_ORDER) {
    const aliases = PROGRAM_CATEGORY_ALIASES[key] || [];
    if (aliases.some((alias) => normalizedTarget === alias || normalizedTarget.includes(alias))) {
      return key;
    }
  }

  return null;
}

export function getRequiredSubjectsForTargetProgram(targetProgram: string, netType?: string): SubjectKey[] {
  const normalizedNetType = String(netType || '').trim().toLowerCase() as NetTrackId;
  if (normalizedNetType && trackIds.has(normalizedNetType)) {
    return SUBJECTS_BY_TRACK[normalizedNetType];
  }

  const categoryKey = getProgramCategoryKey(targetProgram);
  if (categoryKey) {
    return SUBJECTS_BY_TRACK[TRACK_BY_PROGRAM_CATEGORY[categoryKey]];
  }

  return [];
}
