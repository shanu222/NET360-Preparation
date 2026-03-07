import { useState } from 'react';
import { MapPin, School } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';

type SchoolCard = {
  id: string;
  shortName: string;
  fullName: string;
  imagePath: string;
  imageSource: string;
  location: string;
  programmes: string[];
};

const SCHOOL_CARDS: SchoolCard[] = [
  {
    id: 'seecs',
    shortName: 'SEECS',
    fullName: 'School of Electrical Engineering & Computer Science',
    imagePath: '/schools/seecs.png',
    imageSource: 'Islamabad - Main Campus (H-12).png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Electrical Engineering', 'Computer Science', 'Software Engineering', 'Artificial Intelligence'],
  },
  {
    id: 'smme',
    shortName: 'SMME',
    fullName: 'School of Mechanical & Manufacturing Engineering',
    imagePath: '/schools/smme.png',
    imageSource: 'SMME - School of Mechanical & Manufacturing Engineering.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Mechanical Engineering', 'Manufacturing Engineering', 'Robotics & Intelligent Systems'],
  },
  {
    id: 'scee',
    shortName: 'SCEE',
    fullName: 'School of Civil & Environmental Engineering',
    imagePath: '/schools/scee.png',
    imageSource: 'SCEE - School of Civil & Environmental Engineering.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Civil Engineering', 'Environmental Engineering', 'Construction Engineering & Management'],
  },
  {
    id: 'scme',
    shortName: 'SCME',
    fullName: 'School of Chemical & Materials Engineering',
    imagePath: '/schools/scme.png',
    imageSource: 'SCME - School of Chemical & Materials Engineering.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Chemical Engineering', 'Materials Engineering', 'Polymer Engineering'],
  },
  {
    id: 'sns',
    shortName: 'SNS',
    fullName: 'School of Natural Sciences',
    imagePath: '/schools/sns.png',
    imageSource: 'SNS - School of Natural Sciences.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Mathematics', 'Physics', 'Chemistry', 'Biotechnology'],
  },
  {
    id: 'sines',
    shortName: 'SINES',
    fullName: 'School of Interdisciplinary Engineering & Sciences',
    imagePath: '/schools/sines.png',
    imageSource: 'SINES - School of Interdisciplinary Engineering & Sciences.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Data Science', 'Systems Engineering', 'Engineering Management', 'Applied AI'],
  },
  {
    id: 'asab',
    shortName: 'ASAB',
    fullName: 'Atta-ur-Rahman School of Applied Biosciences',
    imagePath: '/schools/asab.png',
    imageSource: 'ASAB - Atta-ur-Rahman School of Applied Biosciences.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Applied Biosciences', 'Food Sciences', 'Agribusiness & Biosystems'],
  },
  {
    id: 'nbs',
    shortName: 'NBS',
    fullName: 'NUST Business School',
    imagePath: '/schools/nbs.png',
    imageSource: 'NBS - NUST Business School.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['BBA', 'Accounting & Finance', 'Economics', 'Business Analytics'],
  },
  {
    id: 's3h',
    shortName: 'S3H',
    fullName: 'School of Social Sciences & Humanities',
    imagePath: '/schools/s3h.png',
    imageSource: 'S3H - School of Social Sciences & Humanities.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Psychology', 'Mass Communication', 'International Relations', 'Public Administration'],
  },
  {
    id: 'sada',
    shortName: 'SADA',
    fullName: 'School of Art, Design & Architecture',
    imagePath: '/schools/sada.png',
    imageSource: 'SADA - School of Art Design And Architecture.png',
    location: 'NUST H-12 Main Campus, Islamabad',
    programmes: ['Architecture', 'Industrial Design', 'Visual Communication Design', 'City & Regional Planning'],
  },
];

export function NUSTSchoolsCampuses() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
          const isExpanded = Boolean(expanded[school.id]);
          const visibleProgrammes = isExpanded ? school.programmes : school.programmes.slice(0, 3);
          return (
            <Card
              key={school.id}
              className="overflow-hidden rounded-2xl border-indigo-100 bg-white/96 shadow-[0_12px_24px_rgba(98,113,202,0.10)]"
            >
              <div className="h-44 w-full overflow-hidden border-b border-indigo-100 bg-slate-100">
                <img
                  src={school.imagePath}
                  alt={`${school.shortName} campus`}
                  className="h-full w-full object-cover"
                  loading="lazy"
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
                    {visibleProgrammes.map((programme) => (
                      <li key={programme}>{programme}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-start gap-2 text-sm text-slate-700">
                  <MapPin className="mt-0.5 h-4 w-4 text-indigo-600" />
                  <span>{school.location}</span>
                </div>

                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <School className="mt-0.5 h-3.5 w-3.5" />
                  <span>Image Source: {school.imageSource}</span>
                </div>
              </CardContent>

              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  onClick={() => setExpanded((prev) => ({ ...prev, [school.id]: !isExpanded }))}
                >
                  {isExpanded ? 'Hide Programmes' : 'View Programmes'}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
