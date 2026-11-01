import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui';
import { useVeo } from '../veo/VeoContext';
import { inferSeason } from '../veo/analytics';
import { mergeImport, playerCandidates, prepareImport, reviewedMapping, sourcePlayerKey, stableJson, type Mapping } from '../veo/importProtocol';
import { VeoPreviewPage } from './VeoPreviewPage';
import { seasonAnalytics } from '../veo/analytics';

export function VeoImportAdmin() {
  const context = useVeo();
  const [season, setSeason] = useState('2026-2027'), [namespace, setNamespace] = useState('inspire');
  const [mapping, setMapping] = useState<Mapping>({ players: {}, sessions: {} });
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [revert, setRevert] = useState<string | null>(null), [revertApproved, setRevertApproved] = useState(false);
  const local = context.local;
  useEffect(() => {
    if (local) setSeason(inferSeason(local.preview) || '');
  }, [local?.hash]);
  useEffect(() => {
    const players = reviewedMapping(context.remote.links, namespace);
    const sessions = Object.fromEntries(context.remote.matches.filter(m => m.namespace === namespace && m.season === season && m.sessionId)
      .map(m => [String(m.round), m.sessionId!]));
    setMapping({ players, sessions }); setApproved(false);
  }, [local?.hash, namespace, season, context.remote.links, context.remote.matches]);
  const plan = useMemo(() => local ? prepareImport({ preview: local.preview, namespace, season,
    filename: local.filename, fileHash: local.hash, mapping, players: context.remote.players,
    sessions: context.remote.sessions, existing: context.remote.matches }) : null,
  [local, namespace, season, mapping, context.remote]);
  useEffect(() => { setApproved(false); }, [plan]);
  const merged = plan ? seasonAnalytics(mergeImport(context.remote.matches, plan.matches), season, namespace) : null;
  const published = context.status === 'ready';
  async function publish() {
    if (!plan || !approved || plan.errors.length || !published || context.role !== 'admin') return;
    setBusy(true); setMessage('');
    try {
      const response = await context.repository.publish(plan.payload, plan.expectedVersions, approved);
      setMessage(response.noOp ? 'Servidor: los datos son idénticos. No se creó otro lote.' : `Servidor: lote ${response.batchId} publicado de forma atómica.`);
      setApproved(false); await context.reload(); context.setSource('published');
    } catch (error) { setMessage(`No se publicó el lote: ${error instanceof Error ? error.message : 'Error desconocido'}`); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    if (!revert || !revertApproved || !published || context.role !== 'admin') return;
    setBusy(true); setMessage('');
    try { await context.repository.revert(revert, true); setMessage('Servidor: lote retirado; sus revisiones anteriores se han restaurado.'); setRevert(null); setRevertApproved(false); await context.reload(); }
    catch (error) { setMessage(`No se retiró el lote: ${error instanceof Error ? error.message : 'Error desconocido'}`); }
    finally { setBusy(false); }
  }
  if (context.role !== 'admin') return <Card><p role="alert">Solo administradores pueden revisar y publicar importaciones.</p></Card>;
  return <>
    <VeoPreviewPage role={context.role} initial={local} onLoaded={context.setLocal}/>
    {local && <Card><h3>Correspondencias revisadas y plan de publicación</h3>
      <p>El Excel no asigna identidades de Supabase. Solo se recuperan correspondencias que un administrador confirmó anteriormente; cualquier candidato nuevo necesita selección explícita.</p>
      {!published && <p className="veo-local-notice">Base VEO sin activar o sin conexión. Puedes explorar toda la analítica local, pero no se simula una publicación ni se inventan directorios.</p>}
      <div className="veo-source-controls"><label>Temporada del lote<input value={season} placeholder="2026-2027" onChange={e => setSeason(e.target.value)}/></label>
        <label>Serie de datos<input value={namespace} onChange={e => setNamespace(e.target.value)} placeholder="inspire"/></label></div>
      <p>La serie identifica un conjunto independiente del club. Mantén la misma serie para la misma competición/historial; no la cambies para evitar un conflicto.</p>
      <h4>Jugadores: identidad permanente</h4>
      <p>Identidades seleccionadas: {local.preview.roster.filter(player => context.remote.players.some(p => p.id === mapping.players[sourcePlayerKey(player.fullName || '')])).length} / {local.preview.roster.length}. Confirma cada UUID; los nombres parecidos no bastan.</p>
      <div className="veo-review-grid">{local.preview.roster.map(player => {
        const key = sourcePlayerKey(player.fullName || '');
        const suggestions = playerCandidates(player.fullName || '', context.remote.players);
        return <label key={player.row}>{player.name} · {player.fullName} · dorsal de origen {player.jersey}
          <select aria-label={`Correspondencia ${player.fullName}`} value={mapping.players[key] || ''} disabled={!published || busy} onChange={e => setMapping(current => ({ ...current, players: { ...current.players, [key]: e.target.value } }))}>
            <option value="">Sin identidad confirmada</option>{context.remote.players.map(p => <option key={p.id} value={p.id}>{p.name} · {p.display_name} · dorsal {p.shirt_number ?? '?'} · {p.id}</option>)}
          </select>{suggestions.length > 0 && <small>Candidato(s) por nombre: {suggestions.map(p => p.name).join(', ')}. No se seleccionan automáticamente.</small>}
          {local.preview.observations.filter(p => p.jersey === player.jersey && p.identity.status === 'ambiguous').map(p => <small key={p.row}>Revisar perfil VEO: {p.profile || 'Sin perfil'}. {p.notes}</small>)}
        </label>;
      })}</div>
      <h4>Partidos: vínculo explícito con sesiones existentes</h4><div className="veo-review-grid">{local.preview.matches.map(({ match }) => <label key={match.row}>J{match.round} · {match.date} · {match.opponent}
        <select aria-label={`Sesión jornada ${match.round}`} value={mapping.sessions[String(match.round)] || ''} disabled={!published || busy} onChange={e => setMapping(current => ({ ...current, sessions: { ...current.sessions, [String(match.round)]: e.target.value } }))}>
          <option value="">Sin sesión confirmada</option>{context.remote.sessions.filter(s => s.session_date === match.date && ['league_match','friendly_match','scrimmage','tryout'].includes(s.type)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.opponent || ''} · {s.id.slice(0, 8)}</option>)}
        </select><small>No se crea ni modifica la sesión, su convocatoria o su estado de Solo registros.</small>
      </label>)}</div>
      {plan && <><h4>Cambios frente a la base</h4><div className="veo-table-wrap"><table><thead><tr><th>Jornada</th><th>Cambio</th><th>Revisión actual</th><th>Observaciones nuevas/cambiadas</th><th>Filas VEO retiradas</th></tr></thead><tbody>{plan.changes.map(change => <tr key={change.round}><td>J{change.round}</td><td>{({ new:'Nuevo', unchanged:'Idéntico', changed:'Corrección' })[change.kind]}</td><td>{change.previousRevision}</td><td>{change.changedPlayers}</td><td>{change.removedPlayers}</td></tr>)}</tbody></table></div>
        {plan.matches.map(next => {
          const old = context.remote.matches.find(m => m.namespace === namespace && m.season === season && m.round === next.round);
          return <details key={next.round}><summary>Inspeccionar observaciones de J{next.round}</summary>
            {next.players.filter(p => stableJson(p) !== stableJson(old?.players.find(previous => previous.playerId === p.playerId))).map(p => {
              const previous = old?.players.find(row => row.playerId === p.playerId);
              return <div key={p.sourceKey}><strong>{p.fullName} · {previous ? 'Cambios' : 'Nueva observación'}</strong>
                <div className="veo-table-wrap"><table><thead><tr><th>Campo</th><th>Anterior</th><th>Propuesto</th></tr></thead><tbody>{Object.keys(p).filter(key => stableJson(p[key as keyof typeof p]) !== stableJson(previous?.[key as keyof typeof p])).map(key => <tr key={key}><td>{key}</td><td><code>{stableJson(previous?.[key as keyof typeof p]) || 'Sin registro'}</code></td><td><code>{stableJson(p[key as keyof typeof p])}</code></td></tr>)}</tbody></table></div>
              </div>;
            })}
            {old?.players.filter(p => !next.players.some(row => row.playerId === p.playerId)).map(p => <p key={p.playerKey} className="error">Se retira de esta revisión VEO: {p.fullName}. Su identidad e historial operativo no se borran; el lote conserva la revisión anterior.</p>)}
          </details>;
        })}
        {merged && <p>Resultado calculado con el historial publicado más este lote: {merged.matches.length} partidos · {merged.bonusCents === null ? 'primas pendientes' : `${(merged.bonusCents / 100).toFixed(2)} € calculados`}. {merged.historyComplete ? 'Sin huecos entre J5 y la última jornada importada.' : `Historial incompleto: ${merged.missingRounds.join(', ') || 'regla no disponible'}.`}</p>}
        {plan.errors.length > 0 && <details open><summary>Bloqueos antes de publicar ({plan.errors.length})</summary>{plan.errors.map(error => <p key={error} className="error">{error}</p>)}</details>}
        <label className="veo-approval"><input type="checkbox" checked={approved} disabled={!published || plan.errors.length > 0 || busy} onChange={e => setApproved(e.target.checked)}/><span>He revisado identidades, sesiones, entradas, discrepancias y filas VEO que se sustituyen o retiran. Apruebo publicar exactamente este lote. No son pagos de primas.</span></label>
        <button className="primary" disabled={!approved || !published || busy || plan.errors.length > 0} onClick={() => void publish()}>{busy ? 'Procesando…' : 'Publicar lote aprobado'}</button>
      </>}
    </Card>}
    {message && <Card><p role="status">{message}</p></Card>}
    <Card><h3>Historial de importaciones</h3>{!published ? <p>Historial no disponible hasta activar o recuperar la base. El archivo local no figura como publicado.</p> : context.remote.batches.length === 0 ? <p>No hay lotes publicados.</p> : [...context.remote.batches].sort((a,b) => b.created_at.localeCompare(a.created_at)).map(batch => <details key={batch.id}><summary>{batch.filename} · {batch.season} · {batch.status === 'published' ? 'Publicado' : 'Retirado'} · {new Date(batch.created_at).toLocaleString('es-ES')}</summary>
      <p>Lote {batch.id} · serie {batch.namespace}</p><p>Validación del servidor: {JSON.stringify(batch.validation)}</p>
      {batch.status === 'published' && <button className="secondary" disabled={busy} onClick={() => { setRevert(batch.id); setRevertApproved(false); }}>Revisar retirada de este lote</button>}
      {revert === batch.id && <div><p>La retirada restaura las revisiones previas de los partidos afectados. Se bloqueará si hay cambios posteriores. Los vínculos revisados se conservan como historial de identidad.</p><label className="veo-approval"><input type="checkbox" checked={revertApproved} onChange={e => setRevertApproved(e.target.checked)}/>Apruebo retirar este lote VEO y restaurar sus revisiones anteriores.</label><button className="secondary danger" disabled={!revertApproved || busy} onClick={() => void withdraw()}>Retirar lote aprobado</button></div>}
    </details>)}</Card>
  </>;
}
