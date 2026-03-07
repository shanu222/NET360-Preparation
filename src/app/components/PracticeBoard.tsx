import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PenLine, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { apiRequest } from '../lib/api';
import { MCQ, getSubjectLabel } from '../lib/mcq';

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

type BoardQuestion = MCQ & {
  imageUrl?: string;
  diagramUrl?: string;
};

const PEN_COLORS = [
  { name: 'Black', value: '#111827' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#15803d' },
  { name: 'Purple', value: '#7e22ce' },
];

export function PracticeBoard() {
  const [questionPool, setQuestionPool] = useState<BoardQuestion[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<BoardQuestion | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);

  const randomQuestion = useCallback((pool: BoardQuestion[], currentId?: string | null) => {
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];

    const candidates = pool.filter((item) => item.id !== currentId);
    const source = candidates.length ? candidates : pool;
    return source[Math.floor(Math.random() * source.length)] || source[0] || null;
  }, []);

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

  const loadQuestionPool = useCallback(async () => {
    setLoadingQuestion(true);
    try {
      const payload = await apiRequest<{ mcqs: BoardQuestion[] }>('/api/mcqs?limit=500');
      const pool = Array.isArray(payload?.mcqs) ? payload.mcqs : [];
      setQuestionPool(pool);
      setActiveQuestion(randomQuestion(pool, null));
    } catch {
      setQuestionPool([]);
      setActiveQuestion(null);
      toast.error('Could not load questions from the database.');
    } finally {
      setLoadingQuestion(false);
    }
  }, [randomQuestion]);

  useEffect(() => {
    void loadQuestionPool();
  }, [loadQuestionPool]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  const questionImage = useMemo(() => {
    if (!activeQuestion) return '';
    return activeQuestion.imageUrl || activeQuestion.diagramUrl || '';
  }, [activeQuestion]);

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
                  ? `${getSubjectLabel(activeQuestion.subject)} • ${activeQuestion.topic} • ${activeQuestion.difficulty}`
                  : 'No question available. Import a new dataset to begin practice.'}
              </CardDescription>
            </div>
            <Button
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
              onClick={() => {
                const next = randomQuestion(questionPool, activeQuestion?.id || null);
                setActiveQuestion(next);
              }}
              disabled={loadingQuestion || !questionPool.length}
            >
              {loadingQuestion ? 'Loading...' : 'Next Question'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-indigo-100 bg-slate-50/60 p-4">
            <p className="text-base text-slate-800 sm:text-lg">
              {activeQuestion?.question || 'Question bank is empty right now.'}
            </p>
            {questionImage ? (
              <img src={questionImage} alt="Question diagram" className="mt-3 max-h-56 w-auto rounded-lg border border-indigo-100 bg-white object-contain" />
            ) : null}
          </div>
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
            className="relative h-[58vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white"
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
