import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PenLine, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { apiRequest } from '../lib/api';
import {
  downloadDataUrlFile as downloadDataUrlFileSafe,
  openDataUrlPreview,
} from '../lib/filePreview';

type Tool = 'pen' | 'eraser';

interface DrawPoint {
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  points: DrawPoint[];
  color: string;
}

interface BoardQuestion {
  id: string;
  subject: string;
  difficulty: string;
  questionText: string;
  questionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  solutionText: string;
  solutionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
}

function isImageMimeType(mimeType?: string | null) {
  return /^image\/(png|jpeg)$/i.test(String(mimeType || ''));
}

function openDataUrlFile(file?: { dataUrl?: string | null } | null) {
  const dataUrl = String(file?.dataUrl || '').trim();
  if (!dataUrl) return;
  if (!openDataUrlPreview(dataUrl)) {
    toast.error('Could not open file preview.');
  }
}

function downloadDataUrlFile(file?: { dataUrl?: string | null; name?: string | null } | null) {
  const dataUrl = String(file?.dataUrl || '').trim();
  if (!dataUrl) return;
  const downloaded = downloadDataUrlFileSafe(dataUrl, String(file?.name || 'practice-file'));
  if (!downloaded) {
    toast.error('Could not download this file.');
  }
}

const PEN_COLORS = [
  { name: 'Black', value: '#111827' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#15803d' },
  { name: 'Purple', value: '#7e22ce' },
];

export function PracticeBoard() {
  const isQuestionBankView = new URLSearchParams(window.location.search).get('view') === 'question-bank';
  const [activeQuestion, setActiveQuestion] = useState<BoardQuestion | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [questionBankQuery, setQuestionBankQuery] = useState('');
  const [questionBankSubject, setQuestionBankSubject] = useState('');
  const [questionBankQuestions, setQuestionBankQuestions] = useState<BoardQuestion[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);

  const formatSubjectLabel = useCallback((subject: string) => {
    const normalized = String(subject || '').trim().toLowerCase();
    if (!normalized) return 'General';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

  const questionBankBySubject = useMemo(() => {
    const grouped = new Map<string, BoardQuestion[]>();
    questionBankQuestions.forEach((item) => {
      const key = String(item.subject || 'general').trim().toLowerCase() || 'general';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([subject, questions]) => ({
        subject,
        questions,
      }));
  }, [questionBankQuestions]);

  const activeQuestionBankSubject = useMemo(() => {
    if (!questionBankBySubject.length) return null;
    return questionBankBySubject.find((item) => item.subject === questionBankSubject) || questionBankBySubject[0];
  }, [questionBankBySubject, questionBankSubject]);

  const visibleQuestionBankItems = useMemo(() => {
    const items = activeQuestionBankSubject?.questions || [];
    if (!questionBankQuery.trim()) return items;
    const needle = questionBankQuery.toLowerCase();
    return items.filter((item) => {
      const blob = [
        item.questionText,
        item.solutionText,
        item.difficulty,
        item.questionFile?.name || '',
        item.solutionFile?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [activeQuestionBankSubject, questionBankQuery]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokesRef.current.forEach((stroke) => {
      if (!stroke.points.length) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
      ctx.lineWidth = stroke.tool === 'eraser' ? 24 : 3;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ratio = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    const nextWidth = Math.floor(width * ratio);
    const nextHeight = Math.floor(height * ratio);
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawCanvas();
  }, [redrawCanvas]);

  const getPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(event);
    if (!point) return;

    isDrawingRef.current = true;
    const stroke: Stroke = { tool, points: [point], color: tool === 'eraser' ? '#ffffff' : penColor };
    currentStrokeRef.current = stroke;
    strokesRef.current.push(stroke);

    event.currentTarget.setPointerCapture(event.pointerId);
    redrawCanvas();
  }, [getPoint, penColor, redrawCanvas, tool]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const point = getPoint(event);
    if (!point) return;

    currentStrokeRef.current.points.push(point);
    redrawCanvas();
  }, [getPoint, redrawCanvas]);

  const endDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
  }, []);

  const clearBoard = useCallback(() => {
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    strokesRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }
    }
    redrawCanvas();
  }, [redrawCanvas]);

  const fetchRandomQuestion = useCallback(async (excludeId?: string) => {
    setLoadingQuestion(true);
    try {
      const query = excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : '';
      const payload = await apiRequest<{ question: BoardQuestion }>(`/api/practice-board/questions/random${query}`);
      setActiveQuestion(payload?.question || null);
      setShowAnswer(false);
    } catch {
      setActiveQuestion(null);
      toast.error('Could not load a practice board question from the database.');
    } finally {
      setLoadingQuestion(false);
    }
  }, []);

  const fetchQuestionBank = useCallback(async () => {
    setQuestionBankLoading(true);
    try {
      const payload = await apiRequest<{ questions: BoardQuestion[] }>('/api/practice-board/questions?limit=500');
      setQuestionBankQuestions(payload?.questions || []);
    } catch {
      setQuestionBankQuestions([]);
      toast.error('Could not load practice board question bank.');
    } finally {
      setQuestionBankLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isQuestionBankView) {
      void fetchQuestionBank();
      return;
    }
    void fetchRandomQuestion();
  }, [fetchQuestionBank, fetchRandomQuestion, isQuestionBankView]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  const questionFile = useMemo(() => activeQuestion?.questionFile || null, [activeQuestion]);
  const solutionFile = useMemo(() => activeQuestion?.solutionFile || null, [activeQuestion]);

  if (isQuestionBankView) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1>Practice Board Question Bank</h1>
            <p className="text-muted-foreground">Browse conceptual questions by subject and open files directly.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}
          >
            Back to Practice Board
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[68vh] space-y-2 overflow-auto">
              {questionBankBySubject.map((group) => (
                <button
                  type="button"
                  key={group.subject}
                  onClick={() => setQuestionBankSubject(group.subject)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activeQuestionBankSubject?.subject === group.subject ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{formatSubjectLabel(group.subject)}</span>
                    <span className="text-xs text-muted-foreground">{group.questions.length}</span>
                  </div>
                </button>
              ))}
              {!questionBankBySubject.length && !questionBankLoading ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No questions found.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Questions</CardTitle>
              <CardDescription>{formatSubjectLabel(activeQuestionBankSubject?.subject || 'general')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[68vh] overflow-auto">
              <Input
                value={questionBankQuery}
                onChange={(event) => setQuestionBankQuery(event.target.value)}
                placeholder="Search by text, difficulty, or file name..."
              />
              {questionBankLoading ? <p className="text-sm text-muted-foreground">Loading question bank...</p> : null}

              {visibleQuestionBankItems.map((item, index) => (
                <article key={item.id} className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                  <p className="font-medium">Q{index + 1}. {item.questionText || '(File-based question)'}</p>
                  <p className="text-xs text-muted-foreground">Difficulty: {item.difficulty || 'Medium'}</p>

                  {item.questionFile ? (
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p>Question file: {item.questionFile.name}</p>
                      <div className="mt-1 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDataUrlFile(item.questionFile)}>View</Button>
                        <Button size="sm" variant="outline" onClick={() => downloadDataUrlFile(item.questionFile)}>Download</Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md bg-emerald-50/70 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">Solution</p>
                    <p className="whitespace-pre-wrap text-xs text-slate-700">{item.solutionText || '(File-only solution)'}</p>
                  </div>

                  {item.solutionFile ? (
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p>Solution file: {item.solutionFile.name}</p>
                      <div className="mt-1 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDataUrlFile(item.solutionFile)}>View</Button>
                        <Button size="sm" variant="outline" onClick={() => downloadDataUrlFile(item.solutionFile)}>Download</Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}

              {!questionBankLoading && !visibleQuestionBankItems.length ? (
                <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No questions found for this subject.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1>Practice Board</h1>
        <p className="text-muted-foreground">Solve one random question at a time on a full digital whiteboard.</p>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_10px_22px_rgba(98,113,202,0.10)]">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-indigo-950">Question</CardTitle>
              <CardDescription>
                {activeQuestion
                  ? `${formatSubjectLabel(activeQuestion.subject)} • ${activeQuestion.difficulty}`
                  : 'No question available. Import a new dataset to begin practice.'}
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                className="w-full border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 sm:w-auto"
                variant="outline"
                onClick={() => setShowAnswer((prev) => !prev)}
                disabled={!activeQuestion}
              >
                {showAnswer ? 'Hide Answer' : 'View Answer'}
              </Button>
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
                onClick={() => void fetchRandomQuestion(activeQuestion?.id)}
                disabled={loadingQuestion}
              >
                {loadingQuestion ? 'Loading...' : 'Next Question'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-indigo-100 bg-slate-50/60 p-4">
            <p className="text-base text-slate-800 sm:text-lg">
              {activeQuestion?.questionText || 'Question bank is empty right now.'}
            </p>
            {questionFile ? (
              isImageMimeType(questionFile.mimeType) ? (
                <img src={questionFile.dataUrl} alt="Question diagram" className="mt-3 max-h-56 w-auto rounded-lg border border-indigo-100 bg-white object-contain" />
              ) : (
                <div className="mt-3 rounded-md border border-indigo-100 bg-white p-2 text-xs text-slate-600">
                  <p>Question file: {questionFile.name}</p>
                  <div className="mt-1 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openDataUrlFile(questionFile)}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => downloadDataUrlFile(questionFile)}>Download</Button>
                  </div>
                </div>
              )
            ) : null}
          </div>

          {showAnswer && activeQuestion ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Answer</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {activeQuestion.solutionText || 'No text answer provided for this question.'}
              </p>
              {solutionFile ? (
                isImageMimeType(solutionFile.mimeType) ? (
                  <img
                    src={solutionFile.dataUrl}
                    alt="Solution diagram"
                    className="mt-3 max-h-56 w-auto rounded-lg border border-emerald-200 bg-white object-contain"
                  />
                ) : (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-white p-2 text-xs text-slate-600">
                    <p>Solution file: {solutionFile.name}</p>
                    <div className="mt-1 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDataUrlFile(solutionFile)}>View</Button>
                      <Button size="sm" variant="outline" onClick={() => downloadDataUrlFile(solutionFile)}>Download</Button>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-indigo-100 bg-white/96 shadow-[0_12px_24px_rgba(98,113,202,0.10)]">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-indigo-950">Digital Whiteboard</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={tool === 'pen' ? 'default' : 'outline'}
                className={tool === 'pen' ? 'bg-indigo-600 text-white' : 'border-indigo-200'}
                onClick={() => setTool('pen')}
              >
                <PenLine className="h-4 w-4" />
                Pen
              </Button>
              <Button
                variant={tool === 'eraser' ? 'default' : 'outline'}
                className={tool === 'eraser' ? 'bg-indigo-600 text-white' : 'border-indigo-200'}
                onClick={() => setTool('eraser')}
              >
                <Eraser className="h-4 w-4" />
                Eraser
              </Button>
              <div className="flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1">
                {PEN_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.name}
                    aria-label={`Use ${color.name} pen color`}
                    onClick={() => {
                      setTool('pen');
                      setPenColor(color.value);
                    }}
                    className={`h-6 w-6 rounded-full border ${penColor === color.value ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <Button variant="outline" className="border-indigo-200" onClick={clearBoard}>
                <RefreshCcw className="h-4 w-4" />
                Clear Board
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={containerRef}
            className="relative h-[48vh] min-h-[250px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-[52vh] sm:min-h-[300px] lg:h-[58vh] lg:min-h-[360px]"
          >
            <canvas
              ref={canvasRef}
              className="touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrawing}
              onPointerCancel={endDrawing}
              onPointerLeave={endDrawing}
              aria-label="Digital writing board"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
