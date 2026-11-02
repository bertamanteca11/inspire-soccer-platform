import { useState } from 'react';
import { supabase } from '../supabase';
import { LoginPanel } from '../components/shell/LoginPanel';

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

  return <LoginPanel logoUrl={logoUrl} email={email} setEmail={setEmail} password={password} setPassword={setPassword} mode={mode} setMode={setMode} onSubmit={login} message={message} error={error}/>;
}
