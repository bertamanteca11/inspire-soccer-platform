import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import '../src/styles/veo-analytics.css';
import { ApplicationShell } from '../src/components/shell/ApplicationShell';
import { Card, Modal, PageTitle } from '../src/components/ui';
import { LoginPanel } from '../src/components/shell/LoginPanel';
import type { Role } from '../src/types';
import type { Tab } from '../src/utils/appTypes';

function Harness() {
  const query = new URLSearchParams(location.search);
  const role = (query.get('role') || 'admin') as Role;
  const [tab, setTab] = useState<Tab>('home');
  const [session] = useState('SYNTHETIC-SESSION-01');
  const [note, setNote] = useState('Synthetic unsaved note');
  const [logout, setLogout] = useState(false);
  const [modal, setModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  if (query.has('login')) return <LoginPanel logoUrl="/logo.png" email={email} setEmail={setEmail} password={password} setPassword={setPassword} mode={mode} setMode={setMode} onSubmit={event => event.preventDefault()} message="" error=""/>;
  const titles: Partial<Record<Tab,string>> = { home: 'Inspire Soccer', sessions: 'Sesiones', players: 'Jugadores', summary: 'Resumen', intelligence: 'Seguimiento semanal' };
  const title = titles[tab] || tab;
  return <ApplicationShell role={role} tab={tab} setTab={setTab} title={title} context={tab === 'home' || tab === 'attendance' ? 'Sesión sintética · 23 octubre · 19:00' : undefined} onLogout={() => setLogout(true)}>
    <div className="stack">
      <PageTitle title={title} subtitle="Solo datos sintéticos. Ningún servicio operativo está conectado."/>
      <Card><p className="kicker">Local fixture</p><h2>Sesión de referencia</h2><p data-testid="selected-session">{session}</p><p data-testid="current-tab">{tab}</p><label>Nota local<input value={note} onChange={event => setNote(event.target.value)}/></label><button type="button" className="secondary" onClick={() => setModal(true)}>Abrir diálogo existente</button>{logout && <p role="status">Salida local solicitada</p>}</Card>
      <Card><h2>Rendimiento sintético</h2><div className="top-row"><span className="rank">#1</span><strong>Jugador de referencia</strong><span>4.20</span></div><p className="muted">Valor ilustrativo; no se calcula ni guarda.</p></Card>
      <div className="veo-module"><div className="veo-hero"><h2>Referencia visual VEO</h2><p>Solo estilos, sin proveedor ni datos VEO.</p></div></div>
      {modal && <Modal title="Diálogo existente" onClose={() => setModal(false)}><p>Controles existentes por encima de la navegación.</p></Modal>}
    </div>
  </ApplicationShell>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
