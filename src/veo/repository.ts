import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsMatch, PlayerFact } from './analytics';
import type { ImportPayload, PlayerDirectory, ReviewedLink, SessionDirectory } from './importProtocol';

export type ImportBatch = { id: string; namespace: string; season: string; filename: string; status: 'published' | 'reverted';
  created_at: string; validation: Record<string, unknown>; reverted_at: string | null };
type Client = Pick<SupabaseClient, 'rpc' | 'from'>;
type MatchRow = { id: string; namespace: string; season: string; round: number; session_id: string; revision: number; active: boolean; batch_id: string; data: Omit<AnalyticsMatch, 'players'> };
type FactRow = { match_id: string; data: PlayerFact };

export class VeoUnavailableError extends Error {}
export class VeoRepository {
  constructor(private readonly client: Client) {}
  async available() {
    const { data, error } = await this.client.rpc('veo_status');
    if (error) {
      if (['PGRST202', '42883', 'PGRST205'].includes(error.code)) throw new VeoUnavailableError('VEO no está activado en esta base de datos. Puedes usar el Excel local. Revisa la guía de activación.');
      throw new Error(`No se pudo comprobar VEO: ${error.message}`);
    }
    if (data?.version !== 1 || data?.ruleVersion !== '2026-j5-v1') throw new VeoUnavailableError('La versión del esquema VEO no es compatible. Revisa la guía de activación.');
    // An installed, empty view is healthy. Check its existence/permissions without
    // requiring an imported match or downloading the calculated data set.
    const { error: viewError } = await this.client.from('veo_calculated_stats').select('match_id').limit(1);
    if (viewError) {
      if (['PGRST205', '42P01', '42883'].includes(viewError.code)) throw new VeoUnavailableError('Falta la vista VEO o su caché de esquema. Revisa la migración 002 y la recarga de PostgREST.');
      throw new Error(`No se pudo comprobar la vista VEO: ${viewError.message}`);
    }
  }
  private async pages<T>(table: string, columns = '*', order: string[] = ['id']): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; ) {
      let query = this.client.from(table).select(columns);
      for (const column of order) query = query.order(column);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw new Error(`${table}: ${error.message}`);
      if (!data?.length) return rows;
      rows.push(...data as unknown as T[]); offset += data.length;
      if (rows.length > 100000) throw new Error('La consulta VEO excede el límite de seguridad; filtra el conjunto antes de cargarlo.');
    }
  }
  async load(role: 'admin' | 'coach') {
    await this.available();
    const [matches, facts, links, batches, players, sessions] = await Promise.all([
      this.pages<MatchRow>('veo_matches'), this.pages<FactRow>('veo_player_match_stats', '*', ['match_id','player_id']),
      role === 'admin' ? this.pages<ReviewedLink>('veo_player_links') : Promise.resolve([]),
      role === 'admin' ? this.pages<ImportBatch>('veo_import_batches', 'id,namespace,season,filename,status,created_at,reverted_at,validation') : Promise.resolve([]),
      role === 'admin' ? this.pages<PlayerDirectory>('players', 'id,name,display_name,shirt_number') : Promise.resolve([]),
      role === 'admin' ? this.pages<SessionDirectory>('sessions', 'id,name,session_date,type,opponent') : Promise.resolve([]),
    ]);
    const decoded: AnalyticsMatch[] = matches.map(row => {
      if (!row.data || typeof row.data.date !== 'string' || !Array.isArray(row.data.teams)) throw new Error('Registro VEO incompatible o incompleto. No se presentan datos inventados.');
      const rows = facts.filter(f => f.match_id === row.id).map(f => f.data);
      if (rows.some(f => !f.playerId || !f.metrics)) throw new Error('Observación VEO sin identidad o métricas válidas.');
      return { ...row.data, id: row.id, namespace: row.namespace, season: row.season, round: row.round,
        sessionId: row.session_id, revision: row.revision, active: row.active, batchId: row.batch_id, players: rows };
    });
    return { matches: decoded, links, batches, players, sessions };
  }
  async publish(payload: ImportPayload, expectedVersions: Record<string, number>, approved: boolean) {
    if (!approved) throw new Error('Revisa y aprueba explícitamente la importación.');
    const { data, error } = await this.client.rpc('veo_publish_import', { p_payload: payload, p_expected_versions: expectedVersions, p_approved: true });
    if (error) throw new Error(error.code === '40001' ? 'Los datos cambiaron desde la revisión. Recarga el estado y vuelve a revisar la previsualización.' : error.message);
    if (typeof data?.noOp !== 'boolean') throw new Error('Respuesta de publicación no verificable. Recarga el historial antes de repetir.');
    return data as { noOp: boolean; batchId: string | null; matches?: number };
  }
  async revert(batchId: string, approved: boolean) {
    if (!approved) throw new Error('Falta aprobación de retirada.');
    const { data, error } = await this.client.rpc('veo_revert_import', { p_batch_id: batchId, p_approved: true });
    if (error) throw new Error(error.message);
    return data;
  }
}
