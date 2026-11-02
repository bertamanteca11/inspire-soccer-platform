import { ChevronRight } from 'lucide-react';
import { useContext } from 'react';
import { ShellTitleContext } from './shell/ShellTitleContext';

export function Card({ children, className = '' }: any) { return <div className={`card ${className}`}>{children}</div>; }
export function Screen({ children }: any) { return <div className="screen">{children}</div>; }
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) { const shellTitle = useContext(ShellTitleContext); return <div className="page-title" data-shell-duplicate={shellTitle === title || undefined}><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>; }
export function Action({ label, onClick }: any) { return <button className="action" onClick={onClick}><span>{label}</span><ChevronRight size={18} /></button>; }
export function Modal({ title, children, onClose }: any) { return <div className="modal-backdrop"><div className="modal-card"><div className="row"><h3>{title}</h3><button className="chip" onClick={onClose}>Cerrar</button></div>{children}</div></div>; }
