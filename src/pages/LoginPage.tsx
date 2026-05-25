import { useState } from 'react';
import { supabase } from '../supabase';
import { Screen } from '../components/ui';

export function LoginPage({ logoUrl }: { logoUrl: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError('Email o contraseña incorrectos.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setError(error.message); else setMessage('Te hemos enviado un enlace de acceso al email.');
  }

  return <Screen><div className="login-card"><img src={logoUrl} className="login-logo" alt="Inspire Soccer" /><h1>Inspire Soccer</h1><p>Accede para gestionar la plataforma del equipo.</p><div className="segmented"><button type="button" className={mode === 'password' ? 'selected' : ''} onClick={() => setMode('password')}>Contraseña</button><button type="button" className={mode === 'magic' ? 'selected' : ''} onClick={() => setMode('magic')}>Email link</button></div><form onSubmit={login} className="stack"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" required />{mode === 'password' && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Contraseña" type="password" required />}<button className="primary">{mode === 'password' ? 'Entrar' : 'Enviar enlace'}</button></form>{message && <p className="success">{message}</p>}{error && <p className="error">{error}</p>}</div></Screen>;
}
