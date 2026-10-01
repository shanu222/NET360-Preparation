import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiRequest } from '../app/lib/api';
import { Button } from '../app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { showErrorToast, showSuccessToast } from '../app/lib/userToast';

interface ClosingMeritProgram {
  id: string;
  name: string;
  institution: string;
  location: string;
  categoryKey: string;
  categoryLabel: string;
  closingMerit: number | null;
  meritPosition: number | null;
  meritStatus: 'real' | 'estimated';
}

interface MeritDraft {
  aggregate: string;
  position: string;
  status: 'real' | 'estimated';
}

const CATEGORIES = [
  { key: 'engineering', label: 'Engineering Programs' },
  { key: 'computing', label: 'Computing Programs' },
  { key: 'business', label: 'Business, Social Sciences & Law' },
  { key: 'architecture', label: 'Architecture & Design' },
  { key: 'sciences', label: 'Natural & Interdisciplinary Sciences' },
  { key: 'applied', label: 'Applied Sciences' },
];

const emptyForm = {
  name: '',
  institution: '',
  location: '',
  categoryKey: 'engineering',
  closingMerit: '',
  meritPosition: '',
  meritStatus: 'estimated' as 'real' | 'estimated',
};

function meritToInput(value: number | null): string {
  return value == null || !Number.isFinite(Number(value)) ? '' : String(value);
}

function draftFrom(program: ClosingMeritProgram): MeritDraft {
  return {
    aggregate: meritToInput(program.closingMerit),
    position: meritToInput(program.meritPosition),
    status: program.meritStatus === 'real' ? 'real' : 'estimated',
  };
}

export function ClosingMeritsPanel({ active }: { active: boolean }) {
  const [programs, setPrograms] = useState<ClosingMeritProgram[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MeritDraft>>({});
  const [year, setYear] = useState('2026');
  const [savingYear, setSavingYear] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const readPrograms = async (path: string) => {
    const data = await apiRequest<{ programs?: ClosingMeritProgram[]; year?: number } | ClosingMeritProgram[]>(path, { timeoutMs: 45000 });
    if (Array.isArray(data)) return { programs: data, year: null as number | null };
    return {
      programs: Array.isArray(data?.programs) ? data.programs : [],
      year: Number.isInteger(Number(data?.year)) ? Number(data.year) : null,
    };
  };

  const load = async () => {
    setLoading(true);
    try {
      let next = { programs: [] as ClosingMeritProgram[], year: null as number | null };
      try {
        next = await readPrograms('/api/admin/closing-merits');
      } catch {
        next = { programs: [], year: null };
      }
      if (!next.programs.length) {
        next = await readPrograms('/api/public/closing-merits');
      }
      setPrograms(next.programs);
      setDrafts(Object.fromEntries(next.programs.map((item) => [item.id, draftFrom(item)])));
      if (next.year) setYear(String(next.year));
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Could not load closing merits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active]);

  const groups = useMemo(() => {
    return CATEGORIES.map((category) => ({
      ...category,
      programs: programs.filter((item) => item.categoryKey === category.key),
    })).filter((group) => group.programs.length > 0);
  }, [programs]);

  const saveMerit = async (program: ClosingMeritProgram) => {
    const draft = drafts[program.id] || draftFrom(program);
    const closingMerit = draft.aggregate.trim() === '' ? null : Number(draft.aggregate);
    const meritPosition = draft.position.trim() === '' ? null : Number(draft.position.replace(/,/g, ''));
    if (closingMerit != null && (!Number.isFinite(closingMerit) || closingMerit < 0 || closingMerit > 100)) {
      showErrorToast('Closing aggregate must be a number from 0 to 100.');
      return;
    }
    if (meritPosition != null && (!Number.isFinite(meritPosition) || meritPosition < 1)) {
      showErrorToast('Closing merit position must be a positive number.');
      return;
    }

    setSavingId(program.id);
    try {
      const data = await apiRequest<{ program: ClosingMeritProgram }>(`/api/admin/closing-merits/${program.id}`, {
        method: 'PUT',
        body: JSON.stringify({ closingMerit, meritPosition, meritStatus: draft.status }),
      });
      setPrograms((current) => current.map((item) => (item.id === program.id ? data.program : item)));
      setDrafts((current) => ({ ...current, [program.id]: draftFrom(data.program) }));
      showSuccessToast('Closing merit saved.');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Could not save that closing merit.');
    } finally {
      setSavingId('');
    }
  };

  const removeProgram = async (program: ClosingMeritProgram) => {
    setDeletingId(program.id);
    try {
      await apiRequest(`/api/admin/closing-merits/${program.id}`, { method: 'DELETE' });
      setPrograms((current) => current.filter((item) => item.id !== program.id));
      showSuccessToast('Program removed.');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Could not remove that program.');
    } finally {
      setDeletingId('');
    }
  };

  const saveYear = async () => {
    const nextYear = Number(year);
    if (!Number.isInteger(nextYear) || nextYear < 2000 || nextYear > 2100) {
      showErrorToast('Enter a year from 2000 to 2100.');
      return;
    }
    setSavingYear(true);
    try {
      const data = await apiRequest<{ year: number }>('/api/admin/closing-merits/settings', {
        method: 'PUT',
        body: JSON.stringify({ year: nextYear }),
      });
      setYear(String(data.year));
      showSuccessToast('Closing-merit year saved.');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Could not save the year.');
    } finally {
      setSavingYear(false);
    }
  };

  const addProgram = async () => {
    const closingMerit = Number(form.closingMerit);
    const meritPosition = form.meritPosition.trim() === '' ? null : Number(form.meritPosition.replace(/,/g, ''));
    if (!form.name.trim() || !form.institution.trim()) {
      showErrorToast('Enter the program name and school.');
      return;
    }
    if (!Number.isFinite(closingMerit) || closingMerit < 0 || closingMerit > 100) {
      showErrorToast('Closing aggregate must be a number from 0 to 100.');
      return;
    }
    if (meritPosition != null && (!Number.isFinite(meritPosition) || meritPosition < 1)) {
      showErrorToast('Closing merit position must be a positive number.');
      return;
    }

    setAdding(true);
    try {
      const data = await apiRequest<{ program: ClosingMeritProgram }>('/api/admin/closing-merits', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          institution: form.institution.trim(),
          location: form.location.trim(),
          categoryKey: form.categoryKey,
          closingMerit,
          meritPosition,
          meritStatus: form.meritStatus,
        }),
      });
      setPrograms((current) => [...current, data.program].sort((a, b) => a.name.localeCompare(b.name)));
      setDrafts((current) => ({ ...current, [data.program.id]: draftFrom(data.program) }));
      setForm(emptyForm);
      showSuccessToast('Program added.');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : 'Could not add that program.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Closing merits</CardTitle>
          <CardDescription>
            These programs, aggregates, merit positions, and Real or Estimated marks appear in the merit calculator. The year applies to the whole list.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-year">List year</Label>
            <Input id="closing-merit-year" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} placeholder="2026" />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => void saveYear()} disabled={savingYear}>
              {savingYear ? 'Saving...' : 'Save year'}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-name">Program</Label>
            <Input id="closing-merit-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Electrical Engineering" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-school">School</Label>
            <Input id="closing-merit-school" value={form.institution} onChange={(event) => setForm((current) => ({ ...current, institution: event.target.value }))} placeholder="SEECS" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-location">Campus</Label>
            <Input id="closing-merit-location" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Main Campus, Islamabad" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-category">Category</Label>
            <select
              id="closing-merit-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.categoryKey}
              onChange={(event) => setForm((current) => ({ ...current, categoryKey: event.target.value }))}
            >
              {CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>{category.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-number">Closing aggregate %</Label>
            <Input id="closing-merit-number" inputMode="decimal" value={form.closingMerit} onChange={(event) => setForm((current) => ({ ...current, closingMerit: event.target.value }))} placeholder="84.2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-position">Closing merit position</Label>
            <Input id="closing-merit-position" inputMode="numeric" value={form.meritPosition} onChange={(event) => setForm((current) => ({ ...current, meritPosition: event.target.value }))} placeholder="1186" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="closing-merit-status">Real or estimated</Label>
            <select
              id="closing-merit-status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.meritStatus}
              onChange={(event) => setForm((current) => ({ ...current, meritStatus: event.target.value === 'real' ? 'real' : 'estimated' }))}
            >
              <option value="real">Real</option>
              <option value="estimated">Estimated</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => void addProgram()} disabled={adding}>
              {adding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {adding ? 'Adding...' : 'Add program'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Programs</CardTitle>
          <CardDescription>{loading ? 'Loading programs...' : `${programs.length} programs`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{group.label}</h3>
              <div className="overflow-hidden rounded-xl border">
                {group.programs.map((program) => (
                  <div key={program.id} className="grid gap-2 border-t p-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_auto_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{program.name}</p>
                      <p className="text-xs text-muted-foreground">{program.institution}{program.location ? ` · ${program.location}` : ''}</p>
                    </div>
                    <Input
                      inputMode="numeric"
                      aria-label={`Closing merit position for ${program.name} ${program.institution}`}
                      placeholder="Position"
                      value={drafts[program.id]?.position ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [program.id]: { ...(current[program.id] || draftFrom(program)), position: event.target.value } }))}
                    />
                    <Input
                      inputMode="decimal"
                      aria-label={`Closing aggregate for ${program.name} ${program.institution}`}
                      placeholder="Aggregate"
                      value={drafts[program.id]?.aggregate ?? ''}
                      onChange={(event) => setDrafts((current) => ({ ...current, [program.id]: { ...(current[program.id] || draftFrom(program)), aggregate: event.target.value } }))}
                    />
                    <select
                      aria-label={`Real or estimated for ${program.name} ${program.institution}`}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={drafts[program.id]?.status ?? 'estimated'}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [program.id]: { ...(current[program.id] || draftFrom(program)), status: event.target.value === 'real' ? 'real' : 'estimated' },
                      }))}
                    >
                      <option value="real">Real</option>
                      <option value="estimated">Estimated</option>
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => void saveMerit(program)} disabled={savingId === program.id}>
                      {savingId === program.id ? 'Saving...' : 'Save'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void removeProgram(program)} disabled={deletingId === program.id}>
                      {deletingId === program.id ? 'Removing...' : 'Remove'}
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!loading && !programs.length ? <p className="text-sm text-muted-foreground">No programs yet. Add one above.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
