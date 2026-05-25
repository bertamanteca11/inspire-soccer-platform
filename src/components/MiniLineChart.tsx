export function MiniLineChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return <div className="empty-chart">Aún no hay datos de evolución.</div>;
  const width = 320, height = 140, max = 5, min = 1;
  const points = data.map((d, i) => ({ x: data.length === 1 ? width / 2 : (i / (data.length - 1)) * width, y: height - ((Number(d.total_score) - min) / (max - min)) * height, score: Number(d.total_score) }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img"><path d={path} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />{points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill="currentColor" />)}</svg><div className="chart-caption">Última media: {points[points.length - 1]?.score || '-'}</div></div>;
}
