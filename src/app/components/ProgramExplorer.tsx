import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Building2, Code, Briefcase, Beaker, Ruler, Sparkles } from 'lucide-react';

export function ProgramExplorer() {
  const programs = {
    engineering: {
      icon: Building2,
      color: 'text-blue-500',
      programs: [
        { name: 'Mechanical Engineering', institution: 'SMME' },
        { name: 'Electrical Engineering', institution: 'SEECS' },
        { name: 'Mechatronics Engineering', institution: 'SMME' },
        { name: 'Civil Engineering', institution: 'SCEE' },
        { name: 'Chemical Engineering', institution: 'SCME' },
        { name: 'Aerospace Engineering', institution: 'CAE' },
        { name: 'Environmental Engineering', institution: 'SCEE' },
        { name: 'Naval Architecture', institution: 'PNEC' },
        { name: 'Software Engineering', institution: 'SEECS' },
        { name: 'Computer Engineering', institution: 'SEECS' },
        { name: 'Information Security', institution: 'SEECS' },
        { name: 'Geoinformatics Engineering', institution: 'CEME' }
      ],
      institutions: ['SMME', 'SEECS', 'SCEE', 'SCME', 'CEME', 'CAE', 'PNEC', 'MCS']
    },
    computing: {
      icon: Code,
      color: 'text-purple-500',
      programs: [
        { name: 'BS Computer Science', institution: 'SEECS' },
        { name: 'BS Artificial Intelligence', institution: 'SEECS' },
        { name: 'BS Data Science', institution: 'SEECS' },
        { name: 'BS Bioinformatics', institution: 'AIMMS' }
      ]
    },
    business: {
      icon: Briefcase,
      color: 'text-green-500',
      programs: [
        { name: 'BBA', institution: 'S3H' },
        { name: 'Economics', institution: 'S3H' },
        { name: 'Psychology', institution: 'S3H' },
        { name: 'Mass Communication', institution: 'S3H' },
        { name: 'Public Administration', institution: 'S3H' },
        { name: 'Accounting & Finance', institution: 'S3H' },
        { name: 'Liberal Arts', institution: 'S3H' },
        { name: 'Tourism Management', institution: 'S3H' },
        { name: 'LLB (Law)', institution: 'S3H' }
      ]
    },
    architecture: {
      icon: Ruler,
      color: 'text-orange-500',
      programs: [
        { name: 'BS Architecture', institution: 'SADA' },
        { name: 'BS Industrial Design', institution: 'SADA' }
      ]
    },
    sciences: {
      icon: Beaker,
      color: 'text-pink-500',
      programs: [
        { name: 'BS Mathematics', institution: 'SNS' },
        { name: 'BS Physics', institution: 'SNS' },
        { name: 'BS Chemistry', institution: 'SNS' }
      ]
    },
    applied: {
      icon: Sparkles,
      color: 'text-teal-500',
      programs: [
        { name: 'BS Biotechnology', institution: 'AIMMS' },
        { name: 'BS Environmental Science', institution: 'AIMMS' },
        { name: 'BS Agriculture', institution: 'AIMMS' },
        { name: 'BS Food Science & Technology', institution: 'AIMMS' }
      ]
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>Explore NUST Programs</h1>
        <p className="text-muted-foreground">Discover all undergraduate programs offered at NUST</p>
      </div>

      <Tabs defaultValue="engineering">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
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
                Engineering Programs
              </CardTitle>
              <CardDescription>
                12 engineering disciplines across multiple institutions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {programs.engineering.programs.map((program, index) => (
                    <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4>{program.name}</h4>
                          <p className="text-sm text-muted-foreground">{program.institution}</p>
                        </div>
                        <Badge variant="outline" className="text-blue-500">Engineering</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-4 pt-4 border-t">
                <h4 className="mb-2">Institutions</h4>
                <div className="flex flex-wrap gap-2">
                  {programs.engineering.institutions.map((inst) => (
                    <Badge key={inst} variant="secondary">{inst}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="computing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-purple-500" />
                Computing Programs
              </CardTitle>
              <CardDescription>
                Cutting-edge computer science and AI programs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {programs.computing.programs.map((program, index) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4>{program.name}</h4>
                        <p className="text-sm text-muted-foreground">{program.institution}</p>
                      </div>
                      <Badge variant="outline" className="text-purple-500">Computing</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                <h4 className="mb-2">Popular Choices</h4>
                <p className="text-sm text-muted-foreground">
                  Computer Science and Artificial Intelligence are among the most sought-after programs
                  at NUST with high competition.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-green-500" />
                Business & Social Sciences
              </CardTitle>
              <CardDescription>
                Diverse programs in business, economics, and social sciences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {programs.business.programs.map((program, index) => (
                    <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4>{program.name}</h4>
                          <p className="text-sm text-muted-foreground">{program.institution}</p>
                        </div>
                        <Badge variant="outline" className="text-green-500">Business</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="architecture" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-orange-500" />
                Architecture & Design
              </CardTitle>
              <CardDescription>
                Creative programs in architecture and industrial design
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {programs.architecture.programs.map((program, index) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4>{program.name}</h4>
                        <p className="text-sm text-muted-foreground">{program.institution}</p>
                      </div>
                      <Badge variant="outline" className="text-orange-500">Architecture</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <h4 className="mb-2">Special Requirements</h4>
                <p className="text-sm text-muted-foreground">
                  Architecture programs require NET Architecture which includes a Design Aptitude test
                  in addition to Math and English.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sciences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Beaker className="w-5 h-5 text-pink-500" />
                Natural Sciences
              </CardTitle>
              <CardDescription>
                Pure science programs in mathematics, physics, and chemistry
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {programs.sciences.programs.map((program, index) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4>{program.name}</h4>
                        <p className="text-sm text-muted-foreground">{program.institution}</p>
                      </div>
                      <Badge variant="outline" className="text-pink-500">Sciences</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-pink-50 dark:bg-pink-950 rounded-lg">
                <h4 className="mb-2">Test Requirements</h4>
                <p className="text-sm text-muted-foreground">
                  Natural Sciences programs require NET Natural Sciences which consists of 50% Mathematics
                  and 50% English.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applied" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-500" />
                Applied Sciences
              </CardTitle>
              <CardDescription>
                Interdisciplinary programs in biotechnology and environmental sciences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {programs.applied.programs.map((program, index) => (
                  <div key={index} className="p-4 border rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4>{program.name}</h4>
                        <p className="text-sm text-muted-foreground">{program.institution}</p>
                      </div>
                      <Badge variant="outline" className="text-teal-500">Applied</Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-4 bg-teal-50 dark:bg-teal-950 rounded-lg">
                <h4 className="mb-2">Test Requirements</h4>
                <p className="text-sm text-muted-foreground">
                  Applied Sciences programs require NET Applied Sciences: 50% Biology, 30% Chemistry, 20% English.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
