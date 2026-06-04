import type { Db } from '../db';
import type { ActivityEvent } from '../../shared/types';
import { randomUUID } from 'node:crypto';

export class EventLog {
  constructor(private db: Db) {}

  append(workspaceId: string, kind: ActivityEvent['kind'], text: string): void {
    this.db.prepare(`INSERT INTO events (id, workspace_id, kind, text, created_at) VALUES (?,?,?,?,?)`)
      .run(randomUUID(), workspaceId, kind, text, Date.now());
  }
  recent(workspaceId: string, limit = 8): ActivityEvent[] {
    return (this.db.prepare(`SELECT * FROM events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(workspaceId, limit) as Record<string, unknown>[])
      .map(r => ({
        id: r.id as string, workspaceId: r.workspace_id as string,
        kind: r.kind as ActivityEvent['kind'], text: r.text as string, createdAt: r.created_at as number,
      }));
  }
}
