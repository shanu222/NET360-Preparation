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
  Mountain,
  Ruler,
  Sparkles,
  Zap,
} from 'lucide-react';

type CategoryKey = 'engineering' | 'computing' | 'business' | 'architecture' | 'sciences' | 'applied';

interface ProgramItem {
  name: string;
  institution: string;
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

export function ProgramExplorer() {
  const programs: Record<CategoryKey, ProgramCategory> = {
    engineering: {
      icon: Building2,
      label: 'Engineering Programs',
      tag: 'Engineering',
      description: '12 engineering disciplines across multiple institutions',
      programs: [
        { name: 'Mechanical Engineering', institution: 'SMME', icon: Cog },
        { name: 'Electrical Engineering', institution: 'SEECS', icon: Zap },
        { name: 'Mechatronics Engineering', institution: 'SMME', icon: Bot },
        { name: 'Civil Engineering', institution: 'SCEE', icon: Landmark },
        { name: 'Chemical Engineering', institution: 'SCME', icon: FlaskConical },
        { name: 'Aerospace Engineering', institution: 'CAE', icon: Mountain },
      ],
      institutions: ['SMME', 'SEECS', 'SCEE', 'SCME', 'CEME', 'CAE', 'PNEC', 'MCS']
    },
    computing: {
      icon: Code,
      label: 'Computing Programs',
      tag: 'Computing',
      description: 'Cutting-edge computer science and AI programs',
      programs: [
        { name: 'BS Computer Science', institution: 'SEECS', icon: Code },
        { name: 'BS Artificial Intelligence', institution: 'SEECS', icon: Sparkles },
        { name: 'BS Data Science', institution: 'SEECS', icon: Atom },
        { name: 'BS Bioinformatics', institution: 'AIMMS', icon: Beaker },
      ]
    },
    business: {
      icon: Briefcase,
      label: 'Business & Social Sciences',
      tag: 'Business',
      description: 'Diverse programs in business, economics, and social sciences',
      programs: [
        { name: 'BBA', institution: 'S3H', icon: Briefcase },
        { name: 'Economics', institution: 'S3H', icon: Building2 },
        { name: 'Psychology', institution: 'S3H', icon: Sparkles },
        { name: 'Accounting & Finance', institution: 'S3H', icon: Landmark },
      ]
    },
    architecture: {
      icon: Ruler,
      label: 'Architecture & Design',
      tag: 'Architecture',
      description: 'Creative programs in architecture and industrial design',
      programs: [
        { name: 'BS Architecture', institution: 'SADA', icon: Ruler },
        { name: 'BS Industrial Design', institution: 'SADA', icon: Mountain },
      ]
    },
    sciences: {
      icon: Beaker,
      label: 'Natural Sciences',
      tag: 'Sciences',
      description: 'Pure science programs in mathematics, physics, and chemistry',
      programs: [
        { name: 'BS Mathematics', institution: 'SNS', icon: Atom },
        { name: 'BS Physics', institution: 'SNS', icon: Zap },
        { name: 'BS Chemistry', institution: 'SNS', icon: FlaskConical },
      ]
    },
    applied: {
      icon: Sparkles,
      label: 'Applied Sciences',
      tag: 'Applied',
      description: 'Interdisciplinary programs in biotechnology and environment',
      programs: [
        { name: 'BS Biotechnology', institution: 'AIMMS', icon: Beaker },
        { name: 'BS Environmental Science', institution: 'AIMMS', icon: Mountain },
        { name: 'BS Agriculture', institution: 'AIMMS', icon: Sparkles },
        { name: 'BS Food Science & Technology', institution: 'AIMMS', icon: FlaskConical },
      ]
    }
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#eef2ff] via-[#ebe8ff] to-[#e6ebff] p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_20%,rgba(168,151,255,0.25),transparent_35%),radial-gradient(circle_at_12%_88%,rgba(140,186,255,0.2),transparent_30%)]" />
        <div className="relative">
          <h1 className="text-3xl text-indigo-950">Explore NUST Programs</h1>
          <p className="text-base text-slate-600">Discover all undergraduate programs offered at NUST</p>
        </div>
      </section>

      <Tabs defaultValue="engineering" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 !bg-white/80 !border-indigo-100">
          <TabsTrigger value="engineering">Engineering</TabsTrigger>
          <TabsTrigger value="computing">Computing</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="architecture">Architecture</TabsTrigger>
          <TabsTrigger value="sciences">Sciences</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
        </TabsList>

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
            <h4 className="text-xl text-indigo-950">{program.name}</h4>
            <p className="text-sm text-slate-500">{program.institution}</p>
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
