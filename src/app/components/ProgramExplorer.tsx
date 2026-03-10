import { type ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import {
  Atom,
  Beaker,
  Bot,
  Briefcase,
  Building2,
  Code,
  Cog,
  FlaskConical,
  Landmark,
  LucideIcon,
  MapPin,
  Mountain,
  Ruler,
  Sparkles,
  Zap,
} from 'lucide-react';

type CategoryKey = 'engineering' | 'computing' | 'business' | 'architecture' | 'sciences' | 'applied';

interface ProgramItem {
  name: string;
  institution: string;
  location: string;
  icon: LucideIcon;
}

interface ProgramCategory {
  icon: LucideIcon;
  label: string;
  tag: string;
  description: string;
  programs: ProgramItem[];
  institutions?: string[];
}

const categoryTabTone: Record<CategoryKey, { idle: string; active: string }> = {
  engineering: {
    idle: 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100',
    active: 'data-[state=active]:from-indigo-600 data-[state=active]:to-violet-500 data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]',
  },
  computing: {
    idle: 'border-cyan-200 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100',
    active: 'data-[state=active]:from-cyan-600 data-[state=active]:to-blue-500 data-[state=active]:shadow-[0_12px_24px_rgba(8,145,178,0.35)]',
  },
  business: {
    idle: 'border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100',
    active: 'data-[state=active]:from-rose-600 data-[state=active]:to-pink-500 data-[state=active]:shadow-[0_12px_24px_rgba(225,29,72,0.32)]',
  },
  architecture: {
    idle: 'border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-100',
    active: 'data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:shadow-[0_12px_24px_rgba(245,158,11,0.34)]',
  },
  sciences: {
    idle: 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100',
    active: 'data-[state=active]:from-emerald-600 data-[state=active]:to-teal-500 data-[state=active]:shadow-[0_12px_24px_rgba(5,150,105,0.33)]',
  },
  applied: {
    idle: 'border-fuchsia-200 bg-fuchsia-50/80 text-fuchsia-700 hover:bg-fuchsia-100',
    active: 'data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-500 data-[state=active]:shadow-[0_12px_24px_rgba(192,38,211,0.34)]',
  },
};

export function ProgramExplorer() {
  const programs: Record<CategoryKey, ProgramCategory> = {
    engineering: {
      icon: Building2,
      label: 'Engineering Programs',
      tag: 'Engineering',
      description: 'Engineering schools and colleges across Islamabad, Rawalpindi, Risalpur, Karachi, and Quetta',
      programs: [
        { name: 'Electrical Engineering', institution: 'SEECS', location: 'Main Campus, Islamabad', icon: Zap },
        { name: 'Mechanical Engineering', institution: 'SMME', location: 'Main Campus, Islamabad', icon: Cog },
        { name: 'Aerospace Engineering', institution: 'SMME', location: 'Main Campus, Islamabad', icon: Mountain },
        { name: 'Civil Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', icon: Landmark },
        { name: 'Environmental Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', icon: Sparkles },
        { name: 'Geoinformatics Engineering', institution: 'SCEE', location: 'Main Campus, Islamabad', icon: Bot },
        { name: 'Chemical Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', icon: FlaskConical },
        { name: 'Metallurgy & Materials Engineering', institution: 'SCME', location: 'Main Campus, Islamabad', icon: Beaker },
        { name: 'Mechanical Engineering', institution: 'CEME', location: 'Rawalpindi', icon: Cog },
        { name: 'Electrical Engineering', institution: 'CEME', location: 'Rawalpindi', icon: Zap },
        { name: 'Mechatronics Engineering', institution: 'CEME', location: 'Rawalpindi', icon: Bot },
        { name: 'Civil Engineering', institution: 'MCE', location: 'Risalpur', icon: Landmark },
        { name: 'Aerospace Engineering', institution: 'CAE', location: 'Risalpur', icon: Mountain },
        { name: 'Avionics Engineering', institution: 'CAE', location: 'Risalpur', icon: Sparkles },
        { name: 'Electrical Engineering', institution: 'PNEC', location: 'Karachi', icon: Zap },
        { name: 'Mechanical Engineering', institution: 'PNEC', location: 'Karachi', icon: Cog },
        { name: 'Naval Architecture & Marine Engineering', institution: 'PNEC', location: 'Karachi', icon: Mountain },
        { name: 'Civil Engineering', institution: 'NBC', location: 'Quetta', icon: Landmark },
      ],
      institutions: ['SEECS', 'SMME', 'SCEE', 'SCME', 'CEME', 'MCE', 'CAE', 'PNEC', 'NBC'],
    },
    computing: {
      icon: Code,
      label: 'Computing Programs',
      tag: 'Computing',
      description: 'Computer science, computational intelligence, data, software, and security programs',
      programs: [
        { name: 'BS Computer Science', institution: 'SEECS', location: 'Main Campus, Islamabad', icon: Code },
        { name: 'BS Artificial Intelligence', institution: 'SEECS', location: 'Main Campus, Islamabad', icon: Sparkles },
        { name: 'BS Data Science', institution: 'SEECS', location: 'Main Campus, Islamabad', icon: Atom },
        { name: 'Computer Engineering', institution: 'CEME', location: 'Rawalpindi', icon: Bot },
        { name: 'Software Engineering', institution: 'MCS', location: 'Rawalpindi', icon: Code },
        { name: 'Information Security', institution: 'MCS', location: 'Rawalpindi', icon: Sparkles },
        { name: 'Computer Science', institution: 'PNEC', location: 'Karachi', icon: Code },
        { name: 'Computer Science', institution: 'NBC', location: 'Quetta', icon: Code },
        { name: 'Artificial Intelligence', institution: 'NBC', location: 'Quetta', icon: Sparkles },
      ],
      institutions: ['SEECS', 'CEME', 'MCS', 'PNEC', 'NBC'],
    },
    business: {
      icon: Briefcase,
      label: 'Business, Social Sciences & Law',
      tag: 'Business/Social',
      description: 'Business, humanities, public policy, and law programs',
      programs: [
        { name: 'BBA', institution: 'NBS', location: 'Main Campus, Islamabad', icon: Briefcase },
        { name: 'MBA', institution: 'NBS', location: 'Main Campus, Islamabad', icon: Briefcase },
        { name: 'BS Economics', institution: 'S3H', location: 'Main Campus, Islamabad', icon: Building2 },
        { name: 'BS Psychology', institution: 'S3H', location: 'Main Campus, Islamabad', icon: Sparkles },
        { name: 'BS Mass Communication', institution: 'S3H', location: 'Main Campus, Islamabad', icon: Code },
        { name: 'BS Liberal Arts & Humanities', institution: 'S3H', location: 'Main Campus, Islamabad', icon: Landmark },
        { name: 'BS Public Administration', institution: 'JSPPL', location: 'Main Campus, Islamabad', icon: Building2 },
        { name: 'LLB', institution: 'NLS', location: 'Main Campus, Islamabad', icon: Landmark },
      ],
      institutions: ['NBS', 'S3H', 'JSPPL', 'NLS'],
    },
    architecture: {
      icon: Ruler,
      label: 'Architecture & Design',
      tag: 'Architecture',
      description: 'Creative programs in architecture and industrial design',
      programs: [
        { name: 'Bachelor of Architecture', institution: 'SADA', location: 'Main Campus, Islamabad', icon: Ruler },
        { name: 'Bachelor of Industrial Design', institution: 'SADA', location: 'Main Campus, Islamabad', icon: Mountain },
      ],
      institutions: ['SADA'],
    },
    sciences: {
      icon: Beaker,
      label: 'Natural & Interdisciplinary Sciences',
      tag: 'Sciences',
      description: 'Natural sciences and interdisciplinary biosciences programs',
      programs: [
        { name: 'BS Physics', institution: 'SNS', location: 'Main Campus, Islamabad', icon: Zap },
        { name: 'BS Mathematics', institution: 'SNS', location: 'Main Campus, Islamabad', icon: Atom },
        { name: 'BS Chemistry', institution: 'SNS', location: 'Main Campus, Islamabad', icon: FlaskConical },
        { name: 'BS Bioinformatics', institution: 'SINES', location: 'Main Campus, Islamabad', icon: Beaker },
        { name: 'Biosciences', institution: 'SINES', location: 'Main Campus, Islamabad', icon: Sparkles },
      ],
      institutions: ['SNS', 'SINES'],
    },
    applied: {
      icon: Sparkles,
      label: 'Applied Sciences',
      tag: 'Applied',
      description: 'Applied biosciences, agriculture, and food science programs',
      programs: [
        { name: 'BS Biotechnology', institution: 'ASAB', location: 'Main Campus, Islamabad', icon: Beaker },
        { name: 'BS Agriculture', institution: 'ASAB', location: 'Main Campus, Islamabad', icon: Sparkles },
        { name: 'BS Food Science & Technology', institution: 'ASAB', location: 'Main Campus, Islamabad', icon: FlaskConical },
      ],
      institutions: ['ASAB'],
    },
  };

  const totalInstitutions = 18;
  const majorLocations = ['Islamabad (Main Campus)', 'Rawalpindi', 'Risalpur', 'Karachi', 'Quetta'];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#eef2ff] via-[#ebe8ff] to-[#e6ebff] p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(168,151,255,0.25),transparent_35%),radial-gradient(circle_at_12%_88%,rgba(140,186,255,0.2),transparent_30%)]" />
        <div className="relative">
          <h1 className="text-3xl text-indigo-950">Explore NUST Programs</h1>
          <p className="text-base text-slate-600">Updated view of NUST Schools, Colleges and Campuses with undergraduate programs</p>
        </div>
      </section>

      <Tabs defaultValue="engineering" className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max gap-2 rounded-2xl border border-indigo-100/80 bg-gradient-to-r from-white to-indigo-50/60 p-1.5 shadow-sm">
            {(['engineering', 'computing', 'business', 'architecture', 'sciences', 'applied'] as CategoryKey[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className={`min-w-[150px] rounded-xl border bg-white/80 px-3 py-1.5 text-[13px] font-semibold tracking-[0.01em] transition-all duration-300 ease-out hover:-translate-y-0.5 data-[state=active]:-translate-y-0.5 data-[state=active]:bg-gradient-to-r data-[state=active]:text-white data-[state=active]:ring-2 data-[state=active]:ring-white/60 ${categoryTabTone[key].idle} ${categoryTabTone[key].active}`}
              >
                {programs[key].tag}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="engineering" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" />
                {programs.engineering.label}
              </CardTitle>
              <CardDescription>
                {programs.engineering.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-2">
                {programs.engineering.programs.map((program) => (
                  <ProgramCard key={program.name} program={program} tag={programs.engineering.tag} />
                ))}
              </div>

              <div className="mt-4 pt-4 border-t">
                <h4 className="mb-2 text-slate-700">Institutions</h4>
                <div className="flex flex-wrap gap-2">
                  {programs.engineering.institutions.map((inst) => (
                    <Badge key={inst} variant="secondary" className="bg-white border border-indigo-100 text-slate-700">{inst}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <ProgramPanel value="computing" category={programs.computing} />
        <ProgramPanel value="business" category={programs.business} />
        <ProgramPanel value="architecture" category={programs.architecture} />
        <ProgramPanel value="sciences" category={programs.sciences} />
        <ProgramPanel value="applied" category={programs.applied} />
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Quick Summary</CardTitle>
          <CardDescription>Total NUST institutions and major locations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-indigo-100 bg-white p-3">
            <p className="text-sm text-slate-600">Total NUST Institutions</p>
            <p className="text-2xl text-indigo-950">~{totalInstitutions}</p>
          </div>
          <div>
            <p className="mb-2 text-sm text-slate-700">Major Locations</p>
            <div className="flex flex-wrap gap-2">
              {majorLocations.map((location) => (
                <Badge key={location} variant="secondary" className="bg-white border border-indigo-100 text-slate-700">
                  {location}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProgramPanel({ value, category }: { value: string; category: ProgramCategory }) {
  const CategoryIcon = category.icon;

  return (
    <TabsContent value={value} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CategoryIcon className="h-5 w-5 text-indigo-500" />
            {category.label}
          </CardTitle>
          <CardDescription>{category.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-2">
            {category.programs.map((program) => (
              <ProgramCard key={program.name} program={program} tag={category.tag} />
            ))}
          </div>

          {category.institutions?.length ? (
            <div className="mt-4 border-t border-indigo-100 pt-4">
              <h4 className="mb-2 text-slate-700">Institutions</h4>
              <div className="flex flex-wrap gap-2">
                {category.institutions.map((inst) => (
                  <Badge key={inst} variant="secondary" className="bg-white border border-indigo-100 text-slate-700">
                    {inst}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function ProgramCard({
  program,
  tag,
}: {
  program: ProgramItem;
  tag: string;
}) {
  const Icon = program.icon as ComponentType<{ className?: string }>;

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-white to-[#f8f5ff] p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h4 className="text-lg text-indigo-950 sm:text-xl">{program.name}</h4>
            <p className="text-sm text-slate-500">{program.institution}</p>
            <p className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3 w-3" />
              {program.location}
            </p>
          </div>
        </div>
        <Badge className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white">{tag}</Badge>
      </div>

      <div className="flex items-center justify-between border-t border-indigo-100 pt-3">
        <p className="text-sm text-slate-500">{tag}</p>
        <Badge variant="outline" className="border-indigo-200 text-indigo-500">{tag}</Badge>
      </div>
    </div>
  );
}
