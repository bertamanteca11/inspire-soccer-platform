import { useEffect, useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { supabase } from '../supabase';
import type { Player } from '../types';
import { Card, Modal, PageTitle } from '../components/ui';
import { MiniLineChart } from '../components/MiniLineChart';
import { translatePosition, translateStatus, translateInjuryStatus } from '../utils/formatters';
import { average } from '../utils/stats';

type PlayerView = 'list' | 'detail';

export function PlayersPage() {
  const [view, setView] = useState<PlayerView>('list');
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [injuries, setInjuries] = useState<any[]>([]);
  const [playerEvolution, setPlayerEvolution] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', nickname: '', position: 'midfielder', shirt_number: '', status: 'active' });

  async function loadPlayers() { const { data } = await supabase.from('players').select('*').order('shirt_number', { ascending: true }); setPlayers(data || []); }
  async function openPlayer(player: Player) {
    setSelected(player); setView('detail');
    setForm({ name: player.name || '', nickname: player.nickname || '', position: player.position || 'midfielder', shirt_number: player.shirt_number ? String(player.shirt_number) : '', status: player.status || 'active' });
    const injuriesRes = await supabase.from('injuries').select('*').eq('player_id', player.id).order('start_date', { ascending: false }); setInjuries(injuriesRes.data || []);
    const evals = await supabase.from('evaluations').select('*').eq('player_id', player.id).order('submitted_at', { ascending: true });
    const sessionIds = [...new Set((evals.data || []).map((e: any) => e.session_id).filter(Boolean))]; let sessionMap: Record<string, any> = {};
    if (sessionIds.length > 0) { const sessions = await supabase.from('sessions').select('id,name,session_date').in('id', sessionIds); sessionMap = Object.fromEntries((sessions.data || []).map((s: any) => [s.id, s])); }
    setPlayerEvolution((evals.data || []).map((e: any) => ({ ...e, session: sessionMap[e.session_id] })).filter((e: any) => e.total_score));
    const att = await supabase.from('attendance').select('*').eq('player_id', player.id); setAttendance(att.data || []);
    const cardRows = await supabase.from('cards').select('*').eq('player_id', player.id); setCards(cardRows.data || []);
  }
  useEffect(() => { loadPlayers(); }, []);

  async function savePlayer(e: React.FormEvent) { e.preventDefault(); const payload = { name: form.name, nickname: form.nickname || null, position: form.position, shirt_number: form.shirt_number ? Number(form.shirt_number) : null, status: form.status }; if (selected) { await supabase.from('players').update(payload).eq('id', selected.id); setSelected({ ...selected, ...payload } as Player); await loadPlayers(); } else { await supabase.from('players').insert(payload); setShowCreate(false); await loadPlayers(); } }

  if (view === 'detail' && selected) {
    const avgScore = average(playerEvolution.map((e: any) => Number(e.total_score))); const lateCount = attendance.filter((a: any) => ['late', 'justified_late'].includes(a.status)).length; const presentCount = attendance.filter((a: any) => a.status === 'present').length;
    return <div className="stack"><button className="secondary" onClick={() => setView('list')}>← Volver a jugadores</button><Card className="player-profile-card"><p className="kicker">Ficha jugador</p><h2>{selected.display_name}</h2><p>{translatePosition(selected.position)} · {translateStatus(selected.status)}</p><div className="mini-grid"><div><strong>{avgScore ? avgScore.toFixed(1) : '-'}</strong><span>media</span></div><div><strong>{presentCount}</strong><span>presentes</span></div><div><strong>{lateCount}</strong><span>tardes</span></div></div><div className="profile-section"><strong>Evolución puntuación</strong><MiniLineChart data={playerEvolution} /></div><div className="profile-section"><strong>Tarjetas</strong><p>{cards.filter(c => c.type === 'yellow').length} amarillas · {cards.filter(c => ['straight_red', 'double_yellow'].includes(c.type)).length} rojas</p></div><div className="profile-section"><strong>Historial lesiones</strong>{injuries.length === 0 && <p>No hay lesiones registradas.</p>}{injuries.slice(0, 8).map(i => <p key={i.id}>{i.start_date} · {i.body_area || i.injury_type || 'Lesión'} · {translateInjuryStatus(i.status)}</p>)}</div></Card><Card><h3>Editar datos</h3><PlayerForm form={form} setForm={setForm} onSubmit={savePlayer} submitLabel="Guardar cambios" /></Card></div>;
  }
  return <div className="stack"><div className="row"><PageTitle title="Jugadores" subtitle="Lista de jugadores y fichas individuales." /><button className="icon-btn big" onClick={() => { setSelected(null); setForm({ name: '', nickname: '', position: 'midfielder', shirt_number: '', status: 'active' }); setShowCreate(true); }}><Plus size={20} /></button></div>{players.map(player => <Card key={player.id}><button className="list-row-button" onClick={() => openPlayer(player)}><div className="avatar"><UserRound size={18} /></div><div><strong>{player.shirt_number ? `${player.shirt_number}. ` : ''}{player.display_name}</strong><p>{player.name} · {translatePosition(player.position)} · {translateStatus(player.status)}</p></div><span>›</span></button></Card>)}{showCreate && <Modal title="Añadir jugador" onClose={() => setShowCreate(false)}><PlayerForm form={form} setForm={setForm} onSubmit={savePlayer} submitLabel="Crear jugador" /></Modal>}</div>;
}

function PlayerForm({ form, setForm, onSubmit, submitLabel }: any) { return <form className="stack" onSubmit={onSubmit}><input placeholder="Nombre completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /><input placeholder="Nickname" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} /><input placeholder="Dorsal" value={form.shirt_number} onChange={e => setForm({ ...form, shirt_number: e.target.value })} /><select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })}><option value="goalkeeper">Portero</option><option value="defender">Defensa</option><option value="midfielder">Mediocentro</option><option value="winger">Extremo</option><option value="forward">Delantero</option></select><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="active">Activo</option><option value="injured">Lesionado</option><option value="trial">Prueba</option><option value="guest">Invitado</option><option value="inactive">Baja</option></select><button className="primary">{submitLabel}</button></form>; }
