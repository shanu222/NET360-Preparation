import { type ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import {
  Briefcase,
  Building2,
  Check,
  CircleHelp,
  Clock3,
  Code,
  FlaskConical,
  Landmark,
  Lightbulb,
  MapPin,
  Ruler,
  Sparkles,
  Target,
} from 'lucide-react';

interface NetSubject {
  name: string;
  percentage: number;
  color: string;
}

interface NetTypeCard {
  title: string;
  icon: ComponentType<{ className?: string }>;
  headerGradient: string;
  tagColor: string;
  usedFor: string[];
  subjects: NetSubject[];
  totalQuestions: number;
  durationMinutes: number;
  difficulty: 'Medium' | 'High';
}

export function NETTypes() {
  const netTypes: NetTypeCard[] = [
    {
      name: 'NET Engineering',
      icon: Building2,
      headerGradient: 'from-violet-500 to-indigo-400',
      tagColor: 'bg-violet-500',
      subjects: [
        { name: 'Mathematics', percentage: 40, color: 'bg-violet-500' },
        { name: 'Physics', percentage: 30, color: 'bg-violet-400' },
        { name: 'English', percentage: 20, color: 'bg-violet-300' },
        { name: 'IQ', percentage: 10, color: 'bg-violet-200' },
      ],
      usedFor: ['Engineering', 'Computer Science', 'Software Engineering'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
      title: 'NET Engineering',
    },
    {
      name: 'NET Computer Science',
      title: 'NET Computer Science',
      icon: Code,
      headerGradient: 'from-blue-500 to-cyan-400',
      tagColor: 'bg-blue-500',
      subjects: [
        { name: 'Mathematics', percentage: 30, color: 'bg-blue-500' },
        { name: 'Physics', percentage: 30, color: 'bg-blue-400' },
        { name: 'Computer Science', percentage: 30, color: 'bg-blue-300' },
        { name: 'English', percentage: 10, color: 'bg-blue-200' },
      ],
      usedFor: ['Computer Science', 'Software Engineering'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      name: 'NET Applied Sciences',
      title: 'NET Applied Sciences',
      icon: FlaskConical,
      headerGradient: 'from-teal-500 to-cyan-400',
      tagColor: 'bg-teal-500',
      subjects: [
        { name: 'Biology', percentage: 40, color: 'bg-emerald-500' },
        { name: 'Chemistry', percentage: 30, color: 'bg-emerald-400' },
        { name: 'Physics', percentage: 20, color: 'bg-emerald-300' },
        { name: 'English', percentage: 10, color: 'bg-amber-300' },
      ],
      usedFor: ['Biological Sciences', 'Chemistry', 'Physics'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      name: 'NET Natural Sciences',
      title: 'NET Natural Sciences',
      icon: Sparkles,
      headerGradient: 'from-cyan-500 to-sky-400',
      tagColor: 'bg-cyan-500',
      subjects: [
        { name: 'Biology', percentage: 40, color: 'bg-cyan-500' },
        { name: 'Chemistry', percentage: 30, color: 'bg-teal-400' },
        { name: 'Physics', percentage: 20, color: 'bg-sky-400' },
      ],
      usedFor: ['Medical Sciences', 'Chemistry', 'Biology'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      name: 'NET Architecture',
      title: 'NET Architecture',
      icon: Ruler,
      headerGradient: 'from-amber-500 to-orange-400',
      tagColor: 'bg-amber-500',
      subjects: [
        { name: 'Mathematics', percentage: 40, color: 'bg-amber-400' },
        { name: 'English', percentage: 20, color: 'bg-orange-400' },
        { name: 'IQ', percentage: 20, color: 'bg-orange-300' },
      ],
      usedFor: ['Architecture', 'Industrial Design'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    },
    {
      name: 'NET Business',
      title: 'NET Business',
      icon: Briefcase,
      headerGradient: 'from-pink-500 to-rose-400',
      tagColor: 'bg-pink-500',
      subjects: [
        { name: 'Mathematics', percentage: 20, color: 'bg-pink-500' },
        { name: 'English', percentage: 40, color: 'bg-rose-400' },
        { name: 'Business', percentage: 20, color: 'bg-pink-300' },
      ],
      usedFor: ['BBA', 'Economics', 'Social Sciences'],
      totalQuestions: 200,
      durationMinutes: 180,
      difficulty: 'Medium',
    }
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1>NET Test Types</h1>
        <p className="text-muted-foreground">Understand different NET categories and their syllabus distribution</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <TopChip icon={Building2} text="Engineering NET" />
        <TopChip icon={Briefcase} text="Business NET" />
        <TopChip icon={FlaskConical} text="Applied Sciences" />
        <TopChip icon={CircleHelp} text="200 Questions" muted="180 Minutes" />
        <TopChip icon={MapPin} text="NUST Testing Centers" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {netTypes.map((net) => (
          <article key={net.name} className="overflow-hidden rounded-2xl border border-indigo-100 bg-white/95 shadow-[0_12px_28px_rgba(98,113,202,0.12)]">
            <header className={`flex items-center gap-2 bg-gradient-to-r px-4 py-3 text-white ${net.headerGradient}`}>
              <net.icon className="h-5 w-5" />
              <h3 className="text-xl text-white">{net.title}</h3>
            </header>

            <div className="space-y-4 p-4">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Subject Distribution</p>
                <div className="space-y-2.5">
                  {net.subjects.map((subject) => (
                    <div key={`${net.name}-${subject.name}`} className="space-y-1">
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
                <p className="mb-2 text-sm font-medium text-slate-700">Used For</p>
                <div className="flex flex-wrap gap-1.5">
                  {net.usedFor.map((program) => (
                    <Badge key={program} className={`${net.tagColor} text-white`}>
                      {program}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-t border-indigo-100 pt-2">
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

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-sky-500" />
            Important Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
              <span>All NET tests are computer-based and conducted at designated test centers.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
              <span>Each question carries equal marks and you should manage time by section.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
              <span>You can appear in multiple NET series and your best score is considered.</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 text-emerald-500" />
              <span>Each exam has 200 MCQs and a total duration of 180 minutes.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
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
    <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-white/85 px-3 text-slate-700 shadow-sm">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium">{text}</span>
      {muted ? <span className="text-xs text-slate-400">{muted}</span> : null}
    </div>
  );
}
