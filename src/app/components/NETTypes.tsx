import { type ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  Briefcase,
  Building2,
  Check,
  CircleHelp,
  FlaskConical,
  Link as LinkIcon,
  MapPin,
  Ruler,
} from 'lucide-react';

interface NetSubject {
  name: string;
  percentage: number;
  color: string;
}

interface NetTypeCard {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentType<{ className?: string }>;
  headerGradient: string;
  tagColor: string;
  admissionProgrammes: string[];
  subjects: NetSubject[];
  notes: string[];
  guidelineLink?: string;
  totalQuestions: number;
  durationMinutes: number;
  difficulty: 'Medium' | 'High';
}

export function NETTypes() {
  const netTypes: NetTypeCard[] = [
    {
      id: 'engineering',
      title: 'NET-Engineering',
      subtitle: 'HSSC Pre-Engineering / Pre-Medical* / ICS / Equivalent',
      icon: Building2,
      headerGradient: 'from-violet-500 to-indigo-400',
      tagColor: 'bg-violet-500',
      subjects: [
        { name: 'Mathematics', percentage: 50, color: 'bg-violet-500' },
        { name: 'Physics', percentage: 30, color: 'bg-violet-400' },
        { name: 'English', percentage: 20, color: 'bg-violet-300' },
      ],
      admissionProgrammes: [
        'Engineering programmes',
        'Computing programmes',
        'BS Bioinformatics',
        'BS Mathematics',
        'BS Physics',
        'BS Chemistry',
        'BS Food Science & Technology',
      ],
      notes: [
        'Pre-Engineering with Additional Bio OR Pre-Medical with Additional Math candidates appear in NET-Engineering.',
        'Pre-Medical candidates applying for Engineering without Additional Math must complete 8-week condensed Mathematics course at NUST before admission.',
        'Pre-Medical candidates applying for Computing programmes without Additional Math also appear in NET-Engineering.',
        'ICS / candidates with Mathematics applying to Computing programmes appear in NET-Engineering.',
      ],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      id: 'applied-sciences',
      title: 'NET-Applied Sciences',
      subtitle: 'HSSC Pre-Medical / Equivalent',
      icon: FlaskConical,
      headerGradient: 'from-teal-500 to-cyan-400',
      tagColor: 'bg-teal-500',
      subjects: [
        { name: 'Biology', percentage: 50, color: 'bg-emerald-500' },
        { name: 'Chemistry', percentage: 30, color: 'bg-emerald-400' },
        { name: 'English', percentage: 20, color: 'bg-amber-300' },
      ],
      admissionProgrammes: [
        'BS Biotechnology',
        'BS Environmental Science',
        'BS Agriculture',
        'BS Food Science & Technology',
        'BS Bioinformatics',
        'BS Chemistry',
      ],
      notes: [
        'This test is for students with Pre-Medical background (with or without Additional Math).',
      ],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      id: 'business-social-sciences',
      title: 'NET-Business Studies & Social Sciences',
      subtitle: 'HSSC with any subject combination',
      icon: Briefcase,
      headerGradient: 'from-pink-500 to-rose-400',
      tagColor: 'bg-pink-500',
      subjects: [
        { name: 'Quantitative Mathematics', percentage: 50, color: 'bg-pink-500' },
        { name: 'English', percentage: 50, color: 'bg-rose-400' },
      ],
      admissionProgrammes: [
        'BBA',
        'BS Public Administration',
        'BS Mass Communication',
        'BS Economics',
        'BS Psychology',
        'BS Accounting & Finance',
        'LLB',
        'BS Tourism & Hospitality Management',
        'BS Liberal Arts & Humanities',
      ],
      notes: ['Students from any academic background can apply.'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      id: 'architecture',
      title: 'NET-Architecture',
      subtitle: 'HSSC with Mathematics & Physics',
      icon: Ruler,
      headerGradient: 'from-amber-500 to-orange-400',
      tagColor: 'bg-amber-500',
      subjects: [
        { name: 'Design Aptitude', percentage: 50, color: 'bg-amber-500' },
        { name: 'Mathematics', percentage: 30, color: 'bg-amber-400' },
        { name: 'English', percentage: 20, color: 'bg-orange-400' },
      ],
      admissionProgrammes: ['B Architecture', 'B Industrial Design'],
      notes: ['Applicants must have Mathematics and Physics in HSSC.'],
      guidelineLink: 'https://sada.nust.edu.pk/in-the-spotlight/design-aptitude-net-guidelines/',
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      id: 'natural-sciences',
      title: 'NET-Natural Sciences',
      subtitle: 'HSSC / Equivalent',
      icon: CircleHelp,
      headerGradient: 'from-cyan-500 to-sky-400',
      tagColor: 'bg-cyan-500',
      subjects: [
        { name: 'Mathematics', percentage: 50, color: 'bg-cyan-500' },
        { name: 'English', percentage: 50, color: 'bg-sky-400' },
      ],
      admissionProgrammes: [
        'BS Mathematics',
        'BS Physics',
        'BS Chemistry',
      ],
      notes: [
        'For candidates whose academic background does not match standard streams.',
      ],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1>NET Test Types</h1>
        <p className="text-muted-foreground">Understand different NET categories and their syllabus distribution</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <TopChip icon={Building2} text="Engineering NET" />
        <TopChip icon={Briefcase} text="Business NET" />
        <TopChip icon={FlaskConical} text="Applied Sciences" />
        <TopChip icon={CircleHelp} text="Natural Sciences" />
        <TopChip icon={CircleHelp} text="200 Questions" muted="180 Minutes" />
        <TopChip icon={MapPin} text="NUST Testing Centers" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {netTypes.map((net) => (
          <article key={net.id} className="overflow-hidden rounded-2xl border border-indigo-100 bg-white/95 shadow-[0_12px_28px_rgba(98,113,202,0.12)]">
            <header className={`flex items-center gap-2 bg-gradient-to-r px-4 py-3 text-white ${net.headerGradient}`}>
              <net.icon className="h-5 w-5" />
              <div>
                <h3 className="text-lg text-white">{net.title}</h3>
                <p className="text-xs text-white/85">{net.subtitle}</p>
              </div>
            </header>

            <div className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Subject Distribution</p>
                <div className="space-y-2.5">
                  {net.subjects.map((subject) => (
                    <div key={`${net.id}-${subject.name}`} className="space-y-1">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>{subject.name}</span>
                        <span>{subject.percentage}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full ${subject.color}`} style={{ width: `${subject.percentage}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-slate-50/80 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Admission Programmes Through This NET</p>
                <div className="flex flex-wrap gap-1.5">
                  {net.admissionProgrammes.map((program) => (
                    <Badge key={program} className={`${net.tagColor} text-white`}>
                      {program}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Notes</p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {net.notes.map((note) => (
                    <li key={note} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>

                {net.guidelineLink ? (
                  <a
                    href={net.guidelineLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-700 underline-offset-2 hover:underline"
                  >
                    <LinkIcon className="h-4 w-4" />
                    Design Aptitude preparation guidelines
                  </a>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 border-t border-indigo-100 pt-2 sm:grid-cols-3 sm:gap-3">
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] text-slate-500">Total Questions</p>
                  <p className="text-indigo-950">{net.totalQuestions}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] text-slate-500">Duration</p>
                  <p className="text-indigo-950">{net.durationMinutes} Minutes</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="text-[11px] text-slate-500">Difficulty</p>
                  <p className="text-indigo-950">{net.difficulty}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

    </div>
  );
}

function TopChip({
  icon: Icon,
  text,
  muted,
}: {
  icon: ComponentType<{ className?: string }>;
  text: string;
  muted?: string;
}) {
  return (
    <div className="inline-flex h-auto min-h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-white/85 px-3 py-2 text-slate-700 shadow-sm">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium leading-tight">{text}</span>
      {muted ? <span className="text-xs leading-tight text-slate-400">{muted}</span> : null}
    </div>
  );
}
