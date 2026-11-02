import { useId, useState, type ReactNode } from 'react';
import '../styles/mobile-cleanup.css';

// Keeps source order and content; pagination changes visibility only.
export function ProgressiveAlerts({ items }: { items: readonly { key: string; content: ReactNode }[] }) {
  const [limit, setLimit] = useState(2);
  const id = useId();
  const next = limit < 5 ? 5 : limit < 10 ? 10 : limit + 10;
  return <><div id={id} className="home-alert-list">{items.slice(0, limit).map(item => <div key={item.key}>{item.content}</div>)}</div>
    {items.length > limit && <button type="button" className="secondary" aria-controls={id} onClick={() => setLimit(next)}>Ver {Math.min(next, items.length)} avisos</button>}
    {limit > 2 && <button type="button" className="secondary" aria-controls={id} onClick={() => setLimit(2)}>Mostrar solo 2</button>}
  </>;
}
