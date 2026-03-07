import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Upload, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface SubmissionAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface UserSubmission {
  id: string;
  subject: string;
  questionText: string;
  questionDescription: string;
  questionSource: string;
  submissionReason: string;
  attachments: SubmissionAttachment[];
  status: 'pending' | 'approved' | 'rejected';
  queuedForBank?: boolean;
  reviewNotes?: string;
  createdAt?: string | null;
}

const SUBJECT_OPTIONS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'Quantitative Mathematics',
  'Design Aptitude',
];

const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_FILES = 3;
const MAX_FILE_SIZE_BYTES = Math.floor(2.5 * 1024 * 1024);
const SUBMISSION_IDS_STORAGE_KEY = 'net360-question-submission-ids';

function statusPillClass(status: UserSubmission['status']) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function statusDotClass(status: UserSubmission['status']) {
  if (status === 'approved') return 'bg-emerald-500';
  if (status === 'rejected') return 'bg-rose-500';
  return 'bg-amber-500';
}

function statusLabel(status: UserSubmission['status']) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Pending Review';
}

function readTrackedSubmissionIds() {
  const raw = localStorage.getItem(SUBMISSION_IDS_STORAGE_KEY);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 100);
  } catch {
    return [];
  }
}

function writeTrackedSubmissionIds(ids: string[]) {
  localStorage.setItem(SUBMISSION_IDS_STORAGE_KEY, JSON.stringify(ids.slice(0, 100)));
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function QuestionContribution() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('Mathematics');
  const [questionText, setQuestionText] = useState('');
  const [questionDescription, setQuestionDescription] = useState('');
  const [questionSource, setQuestionSource] = useState('');
  const [submissionReason, setSubmissionReason] = useState('');
  const [attachments, setAttachments] = useState<SubmissionAttachment[]>([]);
  const [submissions, setSubmissions] = useState<UserSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitterName = useMemo(() => {
    const first = String(user?.firstName || '').trim();
    const last = String(user?.lastName || '').trim();
    return [first, last].filter(Boolean).join(' ');
  }, [user]);

  const loadTrackedSubmissions = async () => {
    const ids = readTrackedSubmissionIds();
    if (!ids.length) {
      setSubmissions([]);
      return;
    }

    try {
      setLoadingSubmissions(true);
      const payload = await apiRequest<{ submissions: UserSubmission[] }>(
        `/api/question-submissions/history?ids=${encodeURIComponent(ids.join(','))}`,
      );
      setSubmissions(Array.isArray(payload?.submissions) ? payload.submissions : []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    void loadTrackedSubmissions();
  }, []);

  const onSelectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.currentTarget.value = '';

    if (!files.length) return;

    if (attachments.length + files.length > MAX_FILES) {
      toast.error(`You can upload up to ${MAX_FILES} files.`);
      return;
    }

    try {
      const nextFiles: SubmissionAttachment[] = [];
      for (const file of files) {
        if (!ACCEPTED_TYPES.has(file.type)) {
          toast.error(`Unsupported file type: ${file.name}`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast.error(`${file.name} is larger than 2.5 MB.`);
          continue;
        }

        const dataUrl = await toDataUrl(file);
        nextFiles.push({
          name: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl,
        });
      }

      if (!nextFiles.length) return;
      setAttachments((prev) => [...prev, ...nextFiles]);
      toast.success(`${nextFiles.length} file(s) attached.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not process selected file.');
    }
  };

  const removeAttachment = (name: string) => {
    setAttachments((prev) => prev.filter((item) => item.name !== name));
  };

  const submitQuestion = async () => {
    if (!subject.trim()) {
      toast.error('Please choose a subject.');
      return;
    }

    if (!questionText.trim() && !attachments.length) {
      toast.error('Add typed text or attach at least one file.');
      return;
    }

    if (!submissionReason.trim()) {
      toast.error('Please explain why this question should be added.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = await apiRequest<{ submission: UserSubmission }>('/api/question-submissions', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          questionText: questionText.trim(),
          questionDescription: questionDescription.trim(),
          questionSource: questionSource.trim(),
          submissionReason: submissionReason.trim(),
          attachments,
          submittedByName: submitterName,
          submittedByEmail: user?.email || '',
          submittedByUserId: user?.id || '',
        }),
      });

      const submissionId = String(payload?.submission?.id || '').trim();
      if (submissionId) {
        const current = readTrackedSubmissionIds();
        const merged = Array.from(new Set([submissionId, ...current]));
        writeTrackedSubmissionIds(merged);
      }

      setQuestionText('');
      setQuestionDescription('');
      setQuestionSource('');
      setSubmissionReason('');
      setAttachments([]);
      toast.success('Question submitted for admin review. Thank you for contributing.');
      await loadTrackedSubmissions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit your question.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1>Question Contribution</h1>
        <p className="text-muted-foreground">Submit questions and resources to help expand the NET360 question bank.</p>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_10px_24px_rgba(98,113,202,0.10)]">
        <CardHeader>
          <CardTitle className="text-indigo-950">Submit a Question</CardTitle>
          <CardDescription>
            No login required. If you are logged in, your profile name is attached automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-text">Write or Paste Question</Label>
            <Textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="min-h-[140px]"
              placeholder="Type or paste the question here..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-description">Question Description</Label>
            <Textarea
              id="question-description"
              value={questionDescription}
              onChange={(e) => setQuestionDescription(e.target.value)}
              className="min-h-[110px]"
              placeholder="Explain the context of the question in your own words..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-source">Source of the Question</Label>
            <Input
              id="question-source"
              value={questionSource}
              onChange={(e) => setQuestionSource(e.target.value)}
              placeholder="Book name, past paper year, personal notes, coaching sheet, etc."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="submission-reason">Reason for Submission</Label>
            <Textarea
              id="submission-reason"
              value={submissionReason}
              onChange={(e) => setSubmissionReason(e.target.value)}
              className="min-h-[120px]"
              placeholder="Why should this be added? How will it help NET preparation?"
            />
            <p className="text-xs text-muted-foreground">
              Prompts: who created this question, why it is important, and how it helps students prepare.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-file-upload">Upload Image / PDF / Word</Label>
            <Input
              id="question-file-upload"
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
              onChange={(e) => void onSelectFiles(e)}
            />
            <p className="text-xs text-muted-foreground">
              Allowed: JPG, PNG, PDF, DOC, DOCX. Maximum {MAX_FILES} files, 2.5 MB each.
            </p>
          </div>

          {attachments.length ? (
            <div className="rounded-lg border border-indigo-100 bg-slate-50/70 p-3">
              <p className="text-sm text-slate-700">Attached files</p>
              <div className="mt-2 space-y-2">
                {attachments.map((item) => (
                  <div key={item.name} className="flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.mimeType}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => removeAttachment(item.name)}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
              onClick={() => void submitQuestion()}
              disabled={submitting}
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Submitting...' : 'Submit Question'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setQuestionText('');
                setQuestionDescription('');
                setQuestionSource('');
                setSubmissionReason('');
                setAttachments([]);
              }}
              disabled={submitting}
            >
              <Upload className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_10px_24px_rgba(98,113,202,0.10)]">
        <CardHeader>
          <CardTitle className="text-indigo-950">Your Submission Status</CardTitle>
          <CardDescription>
            Track pending, approved, or rejected submissions. Rejected items include the admin explanation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSubmissions ? (
            <p className="text-sm text-muted-foreground">Loading your submissions...</p>
          ) : null}

          {!loadingSubmissions && !submissions.length ? (
            <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
              No submissions tracked yet from this browser.
            </div>
          ) : null}

          {submissions.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{item.subject}</p>
                <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${statusPillClass(item.status)}`}>
                  <span className={`h-2 w-2 rounded-full ${statusDotClass(item.status)}`} />
                  {statusLabel(item.status)}
                </div>
              </div>

              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {item.questionText || item.questionDescription || 'Submission with file attachments only.'}
              </p>

              {item.status === 'rejected' && item.reviewNotes ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Admin feedback: {item.reviewNotes}
                </div>
              ) : null}

              {item.status === 'approved' ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Approved and queued for future question bank processing.
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                {item.createdAt ? `Submitted on ${new Date(item.createdAt).toLocaleString()}` : ''}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
