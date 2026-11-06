import { useRef, useState } from 'react';
import { supabase } from '../supabase';
import { LoginPanel } from '../components/shell/LoginPanel';

export function LoginPage({ logoUrl }: { logoUrl: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if(pending.current)return;
    pending.current=true;setBusy(true);
    setError(''); setMessage('');
    try {
    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError('Email o contraseña incorrectos.');
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } });
    if (error) setError(error.message); else setMessage('Te hemos enviado un enlace de acceso al email.');
    }catch{setError('No se pudo conectar. Comprueba la conexión y vuelve a intentarlo.');}
    finally{pending.current=false;setBusy(false);}
  }

  return <LoginPanel logoUrl={logoUrl} email={email} setEmail={setEmail} password={password} setPassword={setPassword} mode={mode} setMode={setMode} onSubmit={login} message={message} error={error} busy={busy}/>;
}
