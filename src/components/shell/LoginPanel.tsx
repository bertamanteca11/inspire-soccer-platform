import type { FormEvent } from 'react';
import '../../styles/application-shell.css';
import '../../styles/premium-tokens.css';

// Presentation shared with the synthetic fixture; no client or auth dependency.
export function LoginPanel({ logoUrl, email, setEmail, password, setPassword, mode, setMode, onSubmit, message, error, busy = false }: {
  logoUrl: string; email: string; setEmail: (value: string) => void;
  password: string; setPassword: (value: string) => void;
  mode: 'password' | 'magic'; setMode: (value: 'password' | 'magic') => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; message: string; error: string; busy?: boolean;
}) {
  return <div className="club-login"><div className="login-card">
    <img src={logoUrl} className="club-crest" alt="Escudo oficial de Inspire Soccer"/>
    <h1>Inspire Soccer</h1><p>Accede para gestionar la plataforma del equipo.</p>
    <div className="segmented"><button type="button" disabled={busy} className={mode === 'password' ? 'selected' : ''} onClick={() => setMode('password')}>Contraseña</button><button type="button" disabled={busy} className={mode === 'magic' ? 'selected' : ''} onClick={() => setMode('magic')}>Enlace por correo</button></div>
    <form onSubmit={onSubmit} className="stack"><input disabled={busy} aria-label="Correo electrónico" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="Correo electrónico" type="email" required/>{mode === 'password' && <input disabled={busy} aria-label="Contraseña" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Contraseña" type="password" required/>}<button disabled={busy} aria-busy={busy} className="primary">{busy ? 'Accediendo…' : mode === 'password' ? 'Entrar' : 'Enviar enlace'}</button></form>
    {message && <p role="status" className="success">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div></div>;
}
