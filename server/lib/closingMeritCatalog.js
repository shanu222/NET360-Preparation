/** First-load seed. Matches the programs page in src/app/lib/netPrograms.ts. */
export const CLOSING_MERIT_CATEGORY_ORDER = [
  'engineering',
  'computing',
  'business',
  'architecture',
  'sciences',
  'applied',
];

const KNOWN = {
  'BS Computer Science|SEECS': 86.5,
  'Electrical Engineering|SEECS': 84.2,
  'BS Artificial Intelligence|SEECS': 87.1,
  'Software Engineering|MCS': 85.8,
  'Mechanical Engineering|SMME': 82.5,
  'Civil Engineering|SCEE': 78.9,
  'BBA|NBS': 76.4,
  'BS Data Science|SEECS': 86.2,
};

const CATEGORIES = [
  {
    key: 'engineering',
    label: 'Engineering Programs',
    programs: [
      ['Electrical Engineering', 'SEECS', 'Main Campus, Islamabad'],
      ['Mechanical Engineering', 'SMME', 'Main Campus, Islamabad'],
      ['Aerospace Engineering', 'SMME', 'Main Campus, Islamabad'],
      ['Civil Engineering', 'SCEE', 'Main Campus, Islamabad'],
      ['Environmental Engineering', 'SCEE', 'Main Campus, Islamabad'],
      ['Geoinformatics Engineering', 'SCEE', 'Main Campus, Islamabad'],
      ['Chemical Engineering', 'SCME', 'Main Campus, Islamabad'],
      ['Metallurgy & Materials Engineering', 'SCME', 'Main Campus, Islamabad'],
      ['Materials Engineering', 'SCME', 'Main Campus, Islamabad'],
      ['Industrial Engineering', 'SMME', 'Main Campus, Islamabad'],
      ['Petroleum Engineering', 'SCME', 'Main Campus, Islamabad'],
      ['Mechanical Engineering', 'CEME', 'Rawalpindi'],
      ['Electrical Engineering', 'CEME', 'Rawalpindi'],
      ['Mechatronics Engineering', 'CEME', 'Rawalpindi'],
      ['Civil Engineering', 'MCE', 'Risalpur'],
      ['Aerospace Engineering', 'CAE', 'Risalpur'],
      ['Avionics Engineering', 'CAE', 'Risalpur'],
      ['Electrical Engineering', 'PNEC', 'Karachi'],
      ['Mechanical Engineering', 'PNEC', 'Karachi'],
      ['Naval Architecture & Marine Engineering', 'PNEC', 'Karachi'],
      ['Civil Engineering', 'NBC', 'Quetta'],
    ],
  },
  {
    key: 'computing',
    label: 'Computing Programs',
    programs: [
      ['BS Computer Science', 'SEECS', 'Main Campus, Islamabad'],
      ['BS Artificial Intelligence', 'SEECS', 'Main Campus, Islamabad'],
      ['BS Data Science', 'SEECS', 'Main Campus, Islamabad'],
      ['Computer Engineering', 'CEME', 'Rawalpindi'],
      ['Software Engineering', 'MCS', 'Rawalpindi'],
      ['Information Security', 'MCS', 'Rawalpindi'],
      ['Computer Science', 'PNEC', 'Karachi'],
      ['Computer Science', 'NBC', 'Quetta'],
      ['Artificial Intelligence', 'NBC', 'Quetta'],
    ],
  },
  {
    key: 'business',
    label: 'Business, Social Sciences & Law',
    programs: [
      ['BBA', 'NBS', 'Main Campus, Islamabad'],
      ['MBA', 'NBS', 'Main Campus, Islamabad'],
      ['BS Economics', 'S3H', 'Main Campus, Islamabad'],
      ['BS Psychology', 'S3H', 'Main Campus, Islamabad'],
      ['BS Mass Communication', 'S3H', 'Main Campus, Islamabad'],
      ['BS Liberal Arts & Humanities', 'S3H', 'Main Campus, Islamabad'],
      ['BS Public Administration', 'JSPPL', 'Main Campus, Islamabad'],
      ['LLB', 'NLS', 'Main Campus, Islamabad'],
    ],
  },
  {
    key: 'architecture',
    label: 'Architecture & Design',
    programs: [
      ['Bachelor of Architecture', 'SADA', 'Main Campus, Islamabad'],
      ['Bachelor of Industrial Design', 'SADA', 'Main Campus, Islamabad'],
    ],
  },
  {
    key: 'sciences',
    label: 'Natural & Interdisciplinary Sciences',
    programs: [
      ['BS Physics', 'SNS', 'Main Campus, Islamabad'],
      ['BS Mathematics', 'SNS', 'Main Campus, Islamabad'],
      ['BS Chemistry', 'SNS', 'Main Campus, Islamabad'],
      ['BS Bioinformatics', 'SINES', 'Main Campus, Islamabad'],
      ['Biosciences', 'SINES', 'Main Campus, Islamabad'],
    ],
  },
  {
    key: 'applied',
    label: 'Applied Sciences',
    programs: [
      ['BS Biotechnology', 'ASAB', 'Main Campus, Islamabad'],
      ['BS Agriculture', 'ASAB', 'Main Campus, Islamabad'],
      ['BS Food Science & Technology', 'ASAB', 'Main Campus, Islamabad'],
    ],
  },
];

export function closingMeritSeedDocuments() {
  const documents = [];
  let sortOrder = 0;

  CATEGORIES.forEach((category) => {
    category.programs.forEach(([name, institution, location]) => {
      const known = KNOWN[`${name}|${institution}`];
      documents.push({
        name,
        institution,
        location,
        categoryKey: category.key,
        categoryLabel: category.label,
        closingMerit: Number.isFinite(known) ? known : null,
        sortOrder,
      });
      sortOrder += 1;
    });
  });

  return documents;
}
