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
import {
  NET_PROGRAMS_BY_CATEGORY,
  type NetProgramCategory,
  type NetProgramCategoryKey,
  type NetProgramIconKey,
  type NetProgramItem,
} from '../lib/netPrograms';

type CategoryKey = NetProgramCategoryKey;

interface ProgramCategory extends NetProgramCategory {
  icon: LucideIcon;
}

const CATEGORY_ICON_MAP: Record<CategoryKey, LucideIcon> = {
  engineering: Building2,
  computing: Code,
  business: Briefcase,
  architecture: Ruler,
  sciences: Beaker,
  applied: Sparkles,
};

const PROGRAM_ICON_MAP: Record<NetProgramIconKey, LucideIcon> = {
  zap: Zap,
  cog: Cog,
  mountain: Mountain,
  landmark: Landmark,
  sparkles: Sparkles,
  bot: Bot,
  flask: FlaskConical,
  beaker: Beaker,
  code: Code,
  atom: Atom,
  briefcase: Briefcase,
  building2: Building2,
  ruler: Ruler,
};

const PROGRAM_TAB_TRIGGER_CLASS =
  'min-w-[150px] rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-2 text-[13px] font-semibold tracking-[0.01em] text-slate-700 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!from-indigo-600 data-[state=active]:!via-violet-500 data-[state=active]:!to-blue-500 data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]';

export function ProgramExplorer() {
  const programs: Record<CategoryKey, ProgramCategory> = {
    engineering: { ...NET_PROGRAMS_BY_CATEGORY.engineering, icon: CATEGORY_ICON_MAP.engineering },
    computing: { ...NET_PROGRAMS_BY_CATEGORY.computing, icon: CATEGORY_ICON_MAP.computing },
    business: { ...NET_PROGRAMS_BY_CATEGORY.business, icon: CATEGORY_ICON_MAP.business },
    architecture: { ...NET_PROGRAMS_BY_CATEGORY.architecture, icon: CATEGORY_ICON_MAP.architecture },
    sciences: { ...NET_PROGRAMS_BY_CATEGORY.sciences, icon: CATEGORY_ICON_MAP.sciences },
    applied: { ...NET_PROGRAMS_BY_CATEGORY.applied, icon: CATEGORY_ICON_MAP.applied },
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
          <TabsList className="inline-flex h-auto min-w-max gap-1.5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-[#eef2ff] via-[#f1ecff] to-[#f5f8ff] p-1.5 shadow-[0_8px_18px_rgba(79,70,229,0.14)]">
            {(['engineering', 'computing', 'business', 'architecture', 'sciences', 'applied'] as CategoryKey[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className={PROGRAM_TAB_TRIGGER_CLASS}
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
                <Building2 className="h-5 w-5 text-blue-500" />
                {programs.engineering.label}
              </CardTitle>
              <CardDescription>
                {programs.engineering.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-2">
                {programs.engineering.programs.map((program) => (
                  <ProgramCard key={`${program.institution}-${program.name}-${program.location}`} program={program} tag={programs.engineering.tag} />
                ))}
              </div>

              <div className="mt-4 border-t pt-4">
                <h4 className="mb-2 text-slate-700">Institutions</h4>
                <div className="flex flex-wrap gap-2">
                  {(programs.engineering.institutions || []).map((inst) => (
                    <Badge key={inst} variant="secondary" className="border border-indigo-100 bg-white text-slate-700">{inst}</Badge>
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
              <ProgramCard key={`${program.institution}-${program.name}-${program.location}`} program={program} tag={category.tag} />
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
  program: NetProgramItem;
  tag: string;
}) {
  const Icon = (PROGRAM_ICON_MAP[program.iconKey] || Sparkles) as ComponentType<{ className?: string }>;

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-white to-[#f8f5ff] p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h4 className="text-lg text-indigo-950 sm:text-xl break-words">{program.name}</h4>
            <p className="text-sm text-slate-500">{program.institution}</p>
            <p className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-400">
              <MapPin className="h-3 w-3" />
              {program.location}
            </p>
          </div>
        </div>
        <Badge className="shrink-0 bg-gradient-to-r from-indigo-500 to-violet-500 text-white">{tag}</Badge>
      </div>

      <div className="flex items-center justify-between border-t border-indigo-100 pt-3">
        <p className="text-sm text-slate-500">{tag}</p>
        <Badge variant="outline" className="border-indigo-200 text-indigo-500">{tag}</Badge>
      </div>
    </div>
  );
}
