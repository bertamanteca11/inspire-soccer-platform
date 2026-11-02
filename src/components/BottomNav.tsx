import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import type { Role } from '../types';
import type { Tab } from '../utils/appTypes';
import { PremiumScope } from './premium/primitives';
import { ClubCrest } from './shell/ClubCrest';
import { navigationGroups, primaryTabs, SIDEBAR_MEDIA, visibleDestinations } from './shell/navigation';
import '../styles/application-shell.css';

export function BottomNav({ role, tab, setTab }: { role: Role; tab: Tab; setTab: (tab: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = visibleDestinations(role);
  const secondary = items.filter(item => !primaryTabs.includes(item.tab));
  const close = () => { dialog.current?.close(); setMoreOpen(false); };
  const go = (next: Tab) => {
    close(); setTab(next);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [moreOpen]);
  useEffect(() => {
    const media = window.matchMedia(SIDEBAR_MEDIA);
    const resize = () => {
      if (media.matches && dialog.current?.open) {
        dialog.current.close(); setMoreOpen(false);
        document.querySelector<HTMLButtonElement>('.club-sidebar button[aria-current="page"]')?.focus();
      }
      if (!media.matches && document.activeElement?.closest('.club-sidebar')) {
        (document.querySelector<HTMLButtonElement>('.club-mobile-nav button[aria-current="page"]') || trigger.current)?.focus();
      }
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  return <>
    <PremiumScope className="club-sidebar">
      <div className="club-brand"><ClubCrest/><div><strong>Inspire Soccer</strong><span>Club workspace</span></div></div>
      <nav aria-label="Navegación principal">{navigationGroups.map(group => {
        const grouped = items.filter(item => item.group === group);
        return grouped.length ? <div className="club-nav-group" key={group}><p>{group}</p>{grouped.map(item => {
          const Icon = item.icon;
          return <button type="button" key={item.tab} title={item.label} aria-label={item.label} aria-current={tab === item.tab ? 'page' : undefined} onClick={() => go(item.tab)}><Icon size={20} aria-hidden="true"/><span>{item.label}</span></button>;
        })}</div> : null;
      })}</nav><p className="club-sidebar-footer">Gestión y rendimiento</p>
    </PremiumScope>
    <PremiumScope className="club-mobile-scope"><nav className="club-mobile-nav" aria-label="Navegación móvil">
      {items.filter(item => primaryTabs.includes(item.tab)).map(item => {
        const Icon = item.icon;
        return <button type="button" key={item.tab} aria-current={tab === item.tab ? 'page' : undefined} onClick={() => go(item.tab)}><Icon size={21} aria-hidden="true"/><span>{item.label}</span></button>;
      })}
      <button type="button" ref={trigger} aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls="club-more" data-active={secondary.some(item => item.tab === tab) || undefined} onClick={() => { dialog.current?.showModal(); setMoreOpen(true); }}><MoreHorizontal size={21} aria-hidden="true"/><span>Más</span></button>
    </nav></PremiumScope>
    <dialog id="club-more" ref={dialog} className="club-more premium-ui" aria-labelledby="club-more-title"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onCancel={() => setMoreOpen(false)} onClose={() => { setMoreOpen(false); if (!window.matchMedia(SIDEBAR_MEDIA).matches) trigger.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="club-more-heading"><h2 id="club-more-title">Más herramientas</h2><button type="button" aria-label="Cerrar herramientas" autoFocus onClick={close}><X size={22} aria-hidden="true"/></button></div>
      <nav aria-label="Más herramientas">{secondary.map(item => {
        const Icon = item.icon;
        return <button type="button" key={item.tab} aria-current={tab === item.tab ? 'page' : undefined} onClick={() => go(item.tab)}><Icon size={21} aria-hidden="true"/><span>{item.label}</span></button>;
      })}</nav>
    </dialog>
  </>;
}
