import { ChevronRight } from 'lucide-react';
import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { ShellTitleContext } from './shell/ShellTitleContext';

export function Card({ children, className = '' }: any) { return <div className={`card ${className}`}>{children}</div>; }
export function Screen({ children }: any) { return <div className="screen">{children}</div>; }
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) { const shellTitle = useContext(ShellTitleContext); return <div className="page-title" data-shell-duplicate={shellTitle === title || undefined}><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>; }
export function Action({ label, onClick }: any) { return <button className="action" onClick={onClick}><span>{label}</span><ChevronRight size={18} /></button>; }
export function Modal({ title, children, onClose }: {title:string;children:ReactNode;onClose:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    node.showModal(); node.querySelector<HTMLButtonElement>('button')?.focus(); document.body.style.overflow = 'hidden';
    return () => { node.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal-backdrop" aria-labelledby={titleId} tabIndex={-1}
    onKeyDown={event => {
      if(event.key!=='Tab'||event.ctrlKey||event.metaKey||event.altKey)return;
      const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')]
        .filter(node=>node.tabIndex>=0&&node.getClientRects().length>0);
      const first=controls[0],last=controls[controls.length-1];
      if(!first){event.preventDefault();event.currentTarget.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }}
    onCancel={event => {event.preventDefault();onClose();}}
    onClick={event => {if(event.target===event.currentTarget)onClose();}}>
    <div className="modal-card"><div className="row"><h3 id={titleId}>{title}</h3><button type="button" className="chip" onClick={onClose}>Cerrar</button></div>{children}</div>
  </dialog>;
}
