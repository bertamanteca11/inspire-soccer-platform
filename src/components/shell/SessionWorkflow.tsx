import type { Role } from '../../types';
import type { Tab } from '../../utils/appTypes';
import { visibleDestinations } from './navigation';
import '../../styles/application-shell.css';

// Presentation-only shortcuts: never select a session or write a callup.
export function SessionWorkflow({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  return <div className="club-session-workflow"><nav aria-label="Acciones de la sesión seleccionada">
    {visibleDestinations(role).filter(item => ['callup', 'attendance', 'evaluation'].includes(item.tab)).map(item => <button type="button" key={item.tab} aria-current={tab === item.tab ? 'page' : undefined} onClick={() => setTab(item.tab)}>{item.label}</button>)}
  </nav></div>;
}
