import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import '../../styles/premium.css';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function PremiumScope({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`premium-ui ${className}`}>{children}</div>;
}
export function PremiumCard({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ds-card ${className}`}>{children}</div>;
}
export function PremiumButton({ children, variant = 'primary', loading = false, disabled, type = 'button', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; loading?: boolean }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`ds-button ds-button--${variant} ${className}`}>
    {loading && <span className="ds-spinner" aria-hidden="true"/>}{children}
  </button>;
}
export function PremiumBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ds-badge ds-tone--${tone}`}>{children}</span>;
}
export function PremiumMetric({ label, value, unit, scope }: { label: string; value: ReactNode; unit?: string; scope: string }) {
  return <PremiumCard><dl className="ds-metric"><dt>{label}</dt><dd>{value}{unit && <span className="ds-unit"> {unit}</span>}</dd></dl><p className="ds-caption">{scope}</p></PremiumCard>;
}
export function PremiumNotice({ children, tone = 'info', role }: { children: ReactNode; tone?: Tone; role?: 'alert' | 'status' }) {
  return <div className={`ds-notice ds-tone--${tone}`} role={role}>{children}</div>;
}
export function PremiumField({ label, hint, error, id, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const inputId = id || generated;
  const describedBy = [props['aria-describedby'], hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  return <div className="ds-field"><label htmlFor={inputId}>{label}{props.required && <span> (required)</span>}</label>
    <input {...props} id={inputId} className={`ds-input ${className}`} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy}/>
    {hint && <p className="ds-caption" id={`${inputId}-hint`}>{hint}</p>}
    {error && <p className="ds-field-error" id={`${inputId}-error`}>{error}</p>}
  </div>;
}
