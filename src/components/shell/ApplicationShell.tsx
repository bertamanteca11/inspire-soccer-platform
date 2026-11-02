import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Role } from '../../types';
import type { Tab } from '../../utils/appTypes';
import { BottomNav } from '../BottomNav';
import { PremiumBadge, PremiumButton, PremiumScope } from '../premium/primitives';
import { ClubCrest } from './ClubCrest';
import { ShellTitleContext } from './ShellTitleContext';
import '../../styles/application-shell.css';

export function ApplicationShell({ role, tab, setTab, title, context, children, onLogout, error }: {
  role: Role; tab: Tab; setTab: (tab: Tab) => void; title: string; context?: string;
  children: ReactNode; onLogout: () => void; error?: string;
}) {
  return <div className="club-shell">
    <a className="club-skip" href="#club-main">Saltar al contenido</a>
    <BottomNav role={role} tab={tab} setTab={setTab}/>
    <div className="app club-content">
      <PremiumScope className="club-header-scope"><header className="club-header">
        <div className="club-page-identity"><ClubCrest/><div>{title !== 'Inspire Soccer' && <p className="club-eyebrow">Inspire Soccer</p>}<h1>{title}</h1>{context && <p className="club-context">{context}</p>}</div></div>
        <div className="club-account"><PremiumBadge>{role === 'admin' ? 'Admin' : role === 'coach' ? 'Entrenador' : 'Consulta'}</PremiumBadge><PremiumButton variant="quiet" onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={18} aria-hidden="true"/><span className="club-logout-label">Salir</span></PremiumButton></div>
      </header></PremiumScope>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <main id="club-main" className="club-main" tabIndex={-1}><ShellTitleContext.Provider value={title}>{children}</ShellTitleContext.Provider></main>
    </div>
  </div>;
}
