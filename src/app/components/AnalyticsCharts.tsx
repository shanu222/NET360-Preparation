import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

type ProgressPoint = { week: string; score: number };
type RadarPoint = { topic: string; score: number };

export function AnalyticsLineChart({ progressData }: { progressData: ProgressPoint[] }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4">
      <h3 className="mb-1 text-indigo-950">Progress Over Time</h3>
      <p className="mb-3 text-sm text-slate-500">Weekly average test scores</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={progressData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef0ff" />
          <XAxis dataKey="week" hide />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} width={30} />
          <Tooltip />
          <Line type="monotone" dataKey="score" stroke="#8a8ef5" strokeWidth={2.5} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnalyticsRadarChart({ radarData }: { radarData: RadarPoint[] }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4">
      <h3 className="mb-1 text-indigo-950">Topic Performance</h3>
      <p className="mb-3 text-sm text-slate-500">Score distribution by subject</p>
      <ResponsiveContainer width="100%" height={180}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#d8dcff" />
          <PolarAngleAxis dataKey="topic" tick={{ fill: '#68709c', fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar name="Score" dataKey="score" stroke="#8a8ef5" fill="#8a8ef5" fillOpacity={0.3} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
