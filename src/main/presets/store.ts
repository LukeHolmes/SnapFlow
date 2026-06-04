import type { Db } from '../db';
import type { Preset, DestinationId } from '../../shared/types';
import { randomUUID } from 'node:crypto';

export class PresetStore {
  constructor(private db: Db) {}

  list(workspaceId: string): Preset[] {
    return (this.db.prepare(`SELECT * FROM presets WHERE workspace_id = ? ORDER BY created_at`).all(workspaceId) as Record<string, unknown>[])
      .map(toPreset);
  }
  count(workspaceId: string): number {
    return (this.db.prepare(`SELECT COUNT(*) n FROM presets WHERE workspace_id = ?`).get(workspaceId) as { n: number }).n;
  }
  get(workspaceId: string, id: string): Preset | undefined {
    const r = this.db.prepare(`SELECT * FROM presets WHERE id = ? AND workspace_id = ?`).get(id, workspaceId);
    return r ? toPreset(r as Record<string, unknown>) : undefined;
  }
  getByDestination(workspaceId: string, destination: DestinationId): Preset | undefined {
    const r = this.db.prepare(`SELECT * FROM presets WHERE workspace_id = ? AND destination = ? ORDER BY created_at DESC LIMIT 1`).get(workspaceId, destination);
    return r ? toPreset(r as Record<string, unknown>) : undefined;
  }
  add(p: { workspaceId: string; destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }): Preset {
    const preset: Preset = { id: randomUUID(), createdAt: Date.now(), config: p.config ?? {}, ...p };
    this.db.prepare(
      `INSERT INTO presets (id, workspace_id, destination, name, target, config, created_at)
       VALUES (@id, @workspaceId, @destination, @name, @target, @config, @createdAt)`
    ).run({ ...preset, config: JSON.stringify(preset.config) });
    return preset;
  }
  upsertByDestination(p: { workspaceId: string; destination: DestinationId; name: string; target: string; config?: Record<string, unknown> }): Preset {
    const existing = this.getByDestination(p.workspaceId, p.destination);
    if (!existing) return this.add(p);
    const preset: Preset = { ...existing, name: p.name, target: p.target, config: p.config ?? {}, createdAt: existing.createdAt };
    this.db.prepare(
      `UPDATE presets
       SET name = @name, target = @target, config = @config
       WHERE id = @id AND workspace_id = @workspaceId`
    ).run({ ...preset, config: JSON.stringify(preset.config) });
    return preset;
  }
  remove(workspaceId: string, id: string): void {
    this.db.prepare(`DELETE FROM presets WHERE id = ? AND workspace_id = ?`).run(id, workspaceId);
  }
}

function toPreset(r: Record<string, unknown>): Preset {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    destination: r.destination as DestinationId,
    name: r.name as string,
    target: r.target as string,
    config: JSON.parse((r.config as string) || '{}'),
    createdAt: r.created_at as number,
  };
}
