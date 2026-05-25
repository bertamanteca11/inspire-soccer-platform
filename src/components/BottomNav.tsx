import React from 'react';
import { Activity, BarChart3, CalendarDays, ClipboardList, HeartPulse, Shield, Star, Users } from 'lucide-react';
import type { Role } from '../types';
import type { Tab } from '../utils/appTypes';

export function BottomNav({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  const isAdmin = role === 'admin';
  const isCoach = role === 'coach';
  return <nav className={isAdmin ? 'nav-grid admin' : 'nav-grid'}>
    <NavButton active={tab === 'home'} onClick={() => setTab('home')} icon={<Activity />} label="Inicio" />
    {isAdmin && <><NavButton active={tab === 'players'} onClick={() => setTab('players')} icon={<Users />} label="Jugadores" /><NavButton active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={<CalendarDays />} label="Sesiones" /></>}
    {(isAdmin || isCoach) && <NavButton active={tab === 'callup'} onClick={() => setTab('callup')} icon={<Users />} label="Convocatoria" />}
    <NavButton active={tab === 'attendance'} onClick={() => setTab('attendance')} icon={<ClipboardList />} label="Asistencia" />
    <NavButton active={tab === 'evaluation'} onClick={() => setTab('evaluation')} icon={<Star />} label="Evaluar" />
    <NavButton active={tab === 'injuries'} onClick={() => setTab('injuries')} icon={<HeartPulse />} label="Lesiones" />
    <NavButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<BarChart3 />} label="Resumen" />
    {isAdmin && <NavButton active={tab === 'history'} onClick={() => setTab('history')} icon={<Shield />} label="Histórico" />}
  </nav>;
}
function NavButton({ active, onClick, icon, label }: any) { return <button className={active ? 'nav active' : 'nav'} onClick={onClick}>{React.cloneElement(icon, { size: 18 })}<span>{label}</span></button>; }
