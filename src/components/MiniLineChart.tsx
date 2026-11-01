import { evaluationTotal } from '../utils/evaluationScores';
export function MiniLineChart({ data }: { data: any[] }) {
  const scores = (data || []).map(evaluationTotal).filter((score): score is number => score !== null);
  if (scores.length === 0) return <div className="empty-chart">Aún no hay datos de evolución.</div>;
  const width = 320, height = 140, max = 5, min = 1;
  const points = scores.map((score, i) => ({ x: scores.length === 1 ? width / 2 : (i / (scores.length - 1)) * width, y: height - ((score - min) / (max - min)) * height, score }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img"><path d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />{points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill="currentColor" />)}</svg><div className="chart-caption">Última media: {points[points.length - 1]?.score || '-'}</div></div>;
}
