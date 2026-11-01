import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Role } from '../types';
import { supabase } from '../supabase';
import type { Preview } from './types';
import { previewMatches, type AnalyticsMatch } from './analytics';
import { VeoRepository, VeoUnavailableError, type ImportBatch } from './repository';
import type { PlayerDirectory, ReviewedLink, SessionDirectory } from './importProtocol';

export type LocalImport = { preview: Preview; hash: string; filename: string };
type Remote = { matches: AnalyticsMatch[]; links: ReviewedLink[]; batches: ImportBatch[]; players: PlayerDirectory[]; sessions: SessionDirectory[] };
const empty: Remote = { matches: [], links: [], batches: [], players: [], sessions: [] };
type Context = { role: Role; local: LocalImport | null; setLocal: (value: LocalImport | null) => void;
  remote: Remote; status: 'loading' | 'ready' | 'unavailable' | 'error'; error: string;
  source: 'local' | 'published'; setSource: (value: 'local' | 'published') => void;
  matches: AnalyticsMatch[]; reload: () => Promise<void>; repository: VeoRepository };
const VeoContext = createContext<Context | null>(null);
export function VeoProvider({ role, children }: { role: Role; children: ReactNode }) {
  const [local, updateLocal] = useState<LocalImport | null>(null);
  const [remote, setRemote] = useState<Remote>(empty);
  const [source, setSource] = useState<'local' | 'published'>('published');
  const [status, setStatus] = useState<Context['status']>('loading'), [error, setError] = useState('');
  const request = useRef(0);
  const repository = useMemo(() => new VeoRepository(supabase), []);
  const reload = useCallback(async () => {
    const id = ++request.current;
    if (role !== 'admin' && role !== 'coach') { setRemote(empty); setStatus('unavailable'); return; }
    setStatus('loading'); setError('');
    try {
      const result = await repository.load(role);
      if (id === request.current) { setRemote(result); setStatus('ready'); }
    } catch (failure) {
      if (id === request.current) { setRemote(empty); setStatus(failure instanceof VeoUnavailableError ? 'unavailable' : 'error'); setError(failure instanceof Error ? failure.message : 'No se pudo leer VEO.'); }
    }
  }, [role, repository]);
  useEffect(() => { void reload(); return () => { request.current++; }; }, [reload]);
  useEffect(() => { updateLocal(null); }, [role]);
  const setLocal = (value: LocalImport | null) => { updateLocal(value); if (value) setSource('local'); };
  const matches = useMemo(() => source === 'local' ? local ? previewMatches(local.preview) : [] : remote.matches,
    [source, local, remote.matches]);
  return <VeoContext.Provider value={{ role, local, setLocal, remote, status, error, source, setSource, matches, reload, repository }}>{children}</VeoContext.Provider>;
}
export function useVeo() {
  const context = useContext(VeoContext);
  if (!context) throw new Error('Falta el contexto VEO.');
  return context;
}
