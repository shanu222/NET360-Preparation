import { MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';

type SchoolCard = {
  id: string;
  shortName: string;
  fullName: string;
  imageCandidates: string[];
  imageSourceLabel: string;
  location: string;
  programmes: string[];
  type: 'school' | 'campus';
};

const SCHOOL_CARDS: SchoolCard[] = [
  {
    id: 'main-campus',
    shortName: 'NUST Main Campus',
    fullName: 'National University of Sciences and Technology (H-12, Islamabad)',
    imageCandidates: ['/schools/islamabad-main-campus.png'],
    imageSourceLabel: 'islamabad-main-campus.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: [
      'SEECS (Electrical, Computer Science, Software Engineering, AI)',
      'SMME, SCEE, SCME and SNS programs',
      'NBS, S3H, SADA and NLS programs',
      'Interdisciplinary and applied science tracks',
    ],
    type: 'campus',
  },
  {
    id: 'smme',
    shortName: 'SMME',
    fullName: 'School of Mechanical & Manufacturing Engineering',
    imageCandidates: ['/schools/smme.png'],
    imageSourceLabel: 'smme.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Mechanical Engineering', 'Manufacturing Engineering', 'Robotics & Intelligent Systems'],
    type: 'school',
  },
  {
    id: 'scee',
    shortName: 'SCEE',
    fullName: 'School of Civil & Environmental Engineering',
    imageCandidates: ['/schools/scee.png'],
    imageSourceLabel: 'scee.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Civil Engineering', 'Environmental Engineering', 'Construction Engineering & Management'],
    type: 'school',
  },
  {
    id: 'scme',
    shortName: 'SCME',
    fullName: 'School of Chemical & Materials Engineering',
    imageCandidates: ['/schools/scme.png'],
    imageSourceLabel: 'scme.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Chemical Engineering', 'Materials Engineering', 'Polymer Engineering'],
    type: 'school',
  },
  {
    id: 'sns',
    shortName: 'SNS',
    fullName: 'School of Natural Sciences',
    imageCandidates: ['/schools/sns.png'],
    imageSourceLabel: 'sns.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Mathematics', 'Physics', 'Chemistry', 'Biotechnology'],
    type: 'school',
  },
  {
    id: 'sines',
    shortName: 'SINES',
    fullName: 'School of Interdisciplinary Engineering & Sciences',
    imageCandidates: ['/schools/sines.png'],
    imageSourceLabel: 'sines.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Data Science', 'Systems Engineering', 'Engineering Management', 'Applied AI'],
    type: 'school',
  },
  {
    id: 'asab',
    shortName: 'ASAB',
    fullName: 'Atta-ur-Rahman School of Applied Biosciences',
    imageCandidates: ['/schools/asab.png'],
    imageSourceLabel: 'asab.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Applied Biosciences', 'Food Sciences', 'Agribusiness & Biosystems'],
    type: 'school',
  },
  {
    id: 'nbs',
    shortName: 'NBS',
    fullName: 'NUST Business School',
    imageCandidates: ['/schools/nbs.png'],
    imageSourceLabel: 'nbs.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['BBA', 'Accounting & Finance', 'Economics', 'Business Analytics'],
    type: 'school',
  },
  {
    id: 's3h',
    shortName: 'S3H',
    fullName: 'School of Social Sciences & Humanities',
    imageCandidates: ['/schools/s3h.png'],
    imageSourceLabel: 's3h.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Psychology', 'Mass Communication', 'International Relations', 'Public Administration'],
    type: 'school',
  },
  {
    id: 'sada',
    shortName: 'SADA',
    fullName: 'School of Art, Design & Architecture',
    imageCandidates: ['/schools/sada.png'],
    imageSourceLabel: 'sada.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Architecture', 'Industrial Design', 'Visual Communication Design', 'City & Regional Planning'],
    type: 'school',
  },
  {
    id: 'nls',
    shortName: 'NLS',
    fullName: 'NUST Law School',
    imageCandidates: ['/schools/nls.png'],
    imageSourceLabel: 'nls.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['LLB', 'Legal Research', 'Constitutional & International Law'],
    type: 'school',
  },
  {
    id: 'nice',
    shortName: 'NICE',
    fullName: 'NUST Institute of Civil Engineering',
    imageCandidates: ['/schools/nice.png'],
    imageSourceLabel: 'nice.png',
    location: 'NUST Risalpur Campus, Khyber Pakhtunkhwa',
    programmes: ['Civil Engineering', 'Transportation Engineering', 'Geotechnical & Structural Studies'],
    type: 'school',
  },
  {
    id: 'karachi-campus',
    shortName: 'KHI Campus',
    fullName: 'NUST Karachi Campus',
    imageCandidates: ['/schools/karachi-campus.png'],
    imageSourceLabel: 'karachi-campus.png',
    location: 'Karachi, Sindh',
    programmes: ['Regional Program Support', 'Industry Linkages', 'Student Facilitation'],
    type: 'campus',
  },
  {
    id: 'quetta-campus',
    shortName: 'Quetta Campus',
    fullName: 'NUST Quetta Campus',
    imageCandidates: ['/schools/quetta-campus.png'],
    imageSourceLabel: 'quetta-campus.png',
    location: 'Quetta, Balochistan',
    programmes: ['Regional Program Support', 'Student Facilitation', 'Academic Outreach'],
    type: 'campus',
  },
  {
    id: 'rawalpindi-campuses',
    shortName: 'RWP Campuses',
    fullName: 'NUST Rawalpindi Campuses',
    imageCandidates: ['/schools/rawalpindi-campuses.png'],
    imageSourceLabel: 'rawalpindi-campuses.png',
    location: 'Rawalpindi, Punjab',
    programmes: ['Engineering Schools', 'Military-affiliated Institutes', 'Technical Program Streams'],
    type: 'campus',
  },
  {
    id: 'risalpur-campuses',
    shortName: 'Risalpur Campuses',
    fullName: 'NUST Risalpur Campuses',
    imageCandidates: ['/schools/risalpur-campuses.png'],
    imageSourceLabel: 'risalpur-campuses.png',
    location: 'Risalpur, Khyber Pakhtunkhwa',
    programmes: ['Engineering Programs', 'Aviation-linked Academic Streams', 'Civil Engineering Tracks'],
    type: 'campus',
  },
];

function resolveImagePath(card: SchoolCard) {
  // First valid candidate wins; fallback intentionally points to missing asset,
  // which triggers ImageWithFallback placeholder until a correct image is uploaded.
  if (card.imageCandidates.length) return card.imageCandidates[0];
  return '/schools/missing-image.png';
}

export function NUSTSchoolsCampuses() {
  return (
    <div className="space-y-4">
      <div>
        <h1>NUST Schools & Campuses</h1>
        <p className="text-muted-foreground">
          Explore major NUST schools, their campus locations, and programmes offered.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SCHOOL_CARDS.map((school) => {
          const imagePath = resolveImagePath(school);
          return (
            <Card
              key={school.id}
              className="overflow-hidden rounded-2xl border-indigo-100 bg-white/96 shadow-[0_12px_24px_rgba(98,113,202,0.10)]"
            >
              <div className="h-44 w-full overflow-hidden border-b border-indigo-100 bg-slate-100">
                <ImageWithFallback
                  src={imagePath}
                  alt={`${school.shortName} campus`}
                  className="h-full w-full object-cover"
                />
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-indigo-950">{school.shortName}</CardTitle>
                <CardDescription className="text-sm text-slate-600">{school.fullName}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Programmes Offered</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {school.programmes.map((programme) => (
                      <li key={programme}>{programme}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 text-indigo-600" />
                  <span>{school.location}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
