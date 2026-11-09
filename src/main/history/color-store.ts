import type { Db } from '../db';
import { randomUUID } from 'node:crypto';
import type { ColorFormat, PickedColor } from '../../shared/types';

const MAX_RECENT = 32;
const PREF_FORMAT = 'colour_clipboard_format';

export class ColorHistoryStore {
  constructor(private db: Db) {}

  getFormat(): ColorFormat {
    const row = this.db.prepare(`SELECT value FROM app_prefs WHERE key = ?`).get(PREF_FORMAT) as { value: string } | undefined;
    const v = row?.value;
    return v === 'rgb' || v === 'hsl' ? v : 'hex';
  }

  setFormat(format: ColorFormat): void {
    this.db.prepare(`INSERT INTO app_prefs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(PREF_FORMAT, format);
  }

  add(workspaceId: string, hex: string, rgb: { r: number; g: number; b: number }): PickedColor {
    const existing = this.db.prepare(
      `SELECT id FROM picked_colors WHERE workspace_id = ? AND hex = ? ORDER BY created_at DESC LIMIT 1`
    ).get(workspaceId, hex.toUpperCase()) as { id: string } | undefined;
    if (existing) {
      this.db.prepare(`UPDATE picked_colors SET created_at = ? WHERE id = ?`).run(Date.now(), existing.id);
      const row = this.db.prepare(`SELECT * FROM picked_colors WHERE id = ?`).get(existing.id) as Record<string, unknown>;
      return toPicked(row);
    }

    const entry: PickedColor = {
      id: randomUUID(),
      workspaceId,
      hex: hex.toUpperCase(),
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      createdAt: Date.now(),
    };
    this.db.prepare(
      `INSERT INTO picked_colors (id, workspace_id, hex, r, g, b, created_at) VALUES (?,?,?,?,?,?,?)`
    ).run(entry.id, entry.workspaceId, entry.hex, entry.r, entry.g, entry.b, entry.createdAt);
    this.trim(workspaceId);
    return entry;
  }

  list(workspaceId: string, limit = MAX_RECENT): PickedColor[] {
    return (this.db.prepare(
      `SELECT * FROM picked_colors WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(workspaceId, limit) as Record<string, unknown>[]).map(toPicked);
  }

  private trim(workspaceId: string): void {
    const rows = this.db.prepare(
      `SELECT id FROM picked_colors WHERE workspace_id = ? ORDER BY created_at DESC`
    ).all(workspaceId) as { id: string }[];
    for (const extra of rows.slice(MAX_RECENT)) {
      this.db.prepare(`DELETE FROM picked_colors WHERE id = ?`).run(extra.id);
    }
  }
}

function toPicked(r: Record<string, unknown>): PickedColor {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    hex: r.hex as string,
    r: r.r as number,
    g: r.g as number,
    b: r.b as number,
    createdAt: r.created_at as number,
  };
}
