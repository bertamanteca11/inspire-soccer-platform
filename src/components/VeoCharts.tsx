import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function VeoTrend({ data, label, unit = '' }: { data: { name: string; value: number | null }[]; label: string; unit?: string }) {
  if (!data.some(point => point.value !== null)) return <p>Sin observaciones disponibles para {label.toLowerCase()}.</p>;
  return <div className="veo-chart" role="img" aria-label={`${label}${unit ? ` (${unit})` : ''}`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 15, right: 20, left: 0, bottom: 10 }}>
      <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 11 }}/><YAxis width={45}/>
      <Tooltip formatter={(value: number) => [new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value) + (unit ? ` ${unit}` : ''), label]}/>
      <Line dataKey="value" name={label} stroke="#426751" strokeWidth={3} dot={{ r: 4 }} connectNulls={false}/>
    </LineChart></ResponsiveContainer>
  </div>;
}
export function VeoBars({ data, label }: { data: { name: string; value: number }[]; label: string }) {
  if (!data.length) return <p>Sin datos para comparar.</p>;
  return <div className="veo-chart" role="img" aria-label={label}><ResponsiveContainer width="100%" height="100%"><BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{ fontSize: 10 }}/><YAxis width={40}/><Tooltip/>
    <Bar dataKey="value" name={label} fill="#426751" radius={[5, 5, 0, 0]}/>
  </BarChart></ResponsiveContainer></div>;
}
