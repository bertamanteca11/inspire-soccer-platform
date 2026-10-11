import React, { useState } from 'react';
import { ClipboardList, Star, Users, Activity, BarChart3, CalendarDays, HeartPulse, Shield, MoreHorizontal, X } from 'lucide-react';
import type { Role } from '../types';
import type { Tab } from '../utils/appTypes';

export function BottomNav({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = role === 'admin';

  const go = (next: Tab) => {
    setTab(next);
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const secondaryTabs: Tab[] = ['callup', 'attendance', 'evaluation', 'standouts', 'injuries', 'history', 'intelligence', 'reports'];

  return (
    <>
      {moreOpen && (
        <div className="more-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={e => e.stopPropagation()}>
            <div className="more-sheet-head">
              <div><p className="kicker">Inspire Soccer</p><h3>Más herramientas</h3></div>
              <button className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="more-menu-grid">
              {(isAdmin || role === 'coach') && <MoreItem onClick={() => go('callup')} icon={<Users />} label="Convocatoria" />}
              <MoreItem onClick={() => go('attendance')} icon={<ClipboardList />} label="Asistencia" />
              <MoreItem onClick={() => go('evaluation')} icon={<Star />} label="Evaluar" />
              {(isAdmin || role === 'coach') && <MoreItem onClick={() => go('standouts')} icon={<Star />} label="Destacados" />}
              <MoreItem onClick={() => go('injuries')} icon={<HeartPulse />} label="Lesiones" />
              {isAdmin && <MoreItem onClick={() => go('intelligence')} icon={<Shield />} label="Seguimiento semanal" />}
              {(isAdmin || role === 'coach') && <MoreItem onClick={() => go('reports')} icon={<BarChart3 />} label="Informes" />}
              {(isAdmin || role === 'coach') && <MoreItem onClick={() => go('history')} icon={<Shield />} label="Histórico" />}
            </div>
          </div>
        </div>
      )}

      <nav className="nav-grid primary-nav">
        <NavButton active={tab === 'home'} onClick={() => go('home')} icon={<Activity />} label="Inicio" />
        {(isAdmin || role === 'coach') && <NavButton active={tab === 'players'} onClick={() => go('players')} icon={<Users />} label="Equipo" />}
        {(isAdmin || role === 'coach') && <NavButton active={tab === 'sessions'} onClick={() => go('sessions')} icon={<CalendarDays />} label="Sesiones" />}
        <NavButton active={tab === 'summary'} onClick={() => go('summary')} icon={<BarChart3 />} label="Resumen" />
        <NavButton active={secondaryTabs.includes(tab)} onClick={() => setMoreOpen(true)} icon={<MoreHorizontal />} label="Más" />
      </nav>
    </>
  );
}

function NavButton({ active, onClick, icon, label }: any) {
  return (
    <button className={active ? 'nav active' : 'nav'} onClick={onClick}>
      {React.cloneElement(icon, { size: 20 })}
      <span>{label}</span>
    </button>
  );
}

function MoreItem({ onClick, icon, label }: any) {
  return (
    <button className="more-item" onClick={onClick}>
      <span className="more-item-icon">{React.cloneElement(icon, { size: 21 })}</span>
      <strong>{label}</strong>
    </button>
  );
}
