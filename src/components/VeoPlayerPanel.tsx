import { useState } from 'react';
import { useVeo } from '../veo/VeoContext';
import { seasonAnalytics } from '../veo/analytics';
import { PlayerDetail } from '../pages/VeoModule';
import { Card } from './ui';

export function VeoPlayerPanel({ playerId }: { playerId: string }) {
  const context = useVeo();
  const available = context.remote.matches.filter(m => m.active && m.players.some(p => p.playerId === playerId));
  const seasons = [...new Set(available.map(m => m.season))].sort().reverse();
  const [selected, setSelected] = useState('');
  const season = seasons.includes(selected) ? selected : seasons[0] || '';
  const [selectedSeries, setSelectedSeries] = useState('');
  const series = [...new Set(available.filter(m => m.season === season).map(m => m.namespace))].sort();
  const namespace = series.includes(selectedSeries) ? selectedSeries : series[0] || '';
  const player = seasonAnalytics(available, season, namespace).players.find(p => p.playerId === playerId);
  return <Card><h3>Analítica VEO · independiente de la evaluación del entrenador</h3>
    {context.status === 'loading' ? <p>Cargando observaciones VEO…</p> : context.status !== 'ready' ? <p>VEO publicado no disponible. Puedes explorar el Excel local desde el módulo; no se vincula por nombre o dorsal.</p>
      : !player ? <p>No hay datos VEO publicados con una identidad revisada para este jugador.</p>
      : <><label>Temporada VEO<select value={season} onChange={e => setSelected(e.target.value)}>{seasons.map(s => <option key={s}>{s}</option>)}</select></label><label>Serie VEO<select value={namespace} onChange={e => setSelectedSeries(e.target.value)}>{series.map(s => <option key={s}>{s}</option>)}</select></label><div className="veo-module"><PlayerDetail player={player}/></div></>}
    <a href={`/?veo=1&player=${encodeURIComponent(playerId)}`}>Abrir VEO Analytics</a>
  </Card>;
}
