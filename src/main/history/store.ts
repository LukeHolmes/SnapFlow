import type { Db } from '../db';
import { randomUUID } from 'node:crypto';
import { deserialiseAnnotationDocument, serialiseAnnotationDocument } from '../../annotation/model';
import type { AnnotationDocument, Capture, ContentTag, Guide, GuideListItem, GuideStep, GuideType, Stats, SyncRecord } from '../../shared/types';

export class HistoryStore {
  constructor(private db: Db) {}

  insert(c: Capture): void {
    this.db.prepare(
      `INSERT INTO captures (id, workspace_id, filename, image_path, tag, ocr_text, has_pii, created_at, updated_at, deleted, dirty)
       VALUES (@id, @workspaceId, @filename, @imagePath, @tag, @ocrText, @hasPii, @createdAt, @createdAt, 0, 1)`
    ).run({
      id: c.id, workspaceId: c.workspaceId, filename: c.filename, imagePath: c.imagePath,
      tag: c.tag, ocrText: c.ocrText, hasPii: c.hasPii ? 1 : 0, createdAt: c.createdAt,
    });
  }

  /** Update the OCR/tag/PII fields after the background pipeline finishes. Marks the row dirty for sync. */
  updateAnalysis(id: string, ocrText: string, tag: ContentTag | null, hasPii: boolean): void {
    this.db.prepare(`UPDATE captures SET ocr_text = ?, tag = ?, has_pii = ?, updated_at = ?, dirty = 1 WHERE id = ?`)
      .run(ocrText, tag, hasPii ? 1 : 0, Date.now(), id);
  }

  get(workspaceId: string, id: string): Capture | undefined {
    const r = this.db.prepare(
      `SELECT c.*, EXISTS(SELECT 1 FROM capture_annotations a WHERE a.capture_id = c.id) AS has_annotations
       FROM captures c WHERE c.id = ? AND c.workspace_id = ? AND c.deleted = 0`
    ).get(id, workspaceId);
    return r ? toCapture(r as Record<string, unknown>) : undefined;
  }

  list(workspaceId: string, opts: { limit?: number; sinceDays?: number | null } = {}): Capture[] {
    const params: unknown[] = [workspaceId];
    let sql = `SELECT c.*, EXISTS(SELECT 1 FROM capture_annotations a WHERE a.capture_id = c.id) AS has_annotations
      FROM captures c WHERE c.workspace_id = ? AND c.deleted = 0`;
    if (opts.sinceDays != null) { sql += ` AND created_at >= ?`; params.push(Date.now() - opts.sinceDays * 86_400_000); }
    sql += ` ORDER BY created_at DESC`;
    if (opts.limit) { sql += ` LIMIT ?`; params.push(opts.limit); }
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(toCapture);
  }

  /** FTS5 search, always scoped to one workspace (tenant isolation at query layer). */
  search(workspaceId: string, query: string, limit = 50): Capture[] {
    const match = toFtsQuery(query);
    if (!match) return [];
    const rows = this.db.prepare(
      `SELECT c.*, snippet(captures_fts, 1, '[', ']', '…', 10) AS snippet
       , EXISTS(SELECT 1 FROM capture_annotations a WHERE a.capture_id = c.id) AS has_annotations
       FROM captures_fts JOIN captures c ON c.rowid = captures_fts.rowid
       WHERE captures_fts MATCH ? AND c.workspace_id = ? AND c.deleted = 0
       ORDER BY bm25(captures_fts) LIMIT ?`
    ).all(match, workspaceId, limit) as Record<string, unknown>[];
    return rows.map(r => ({ ...toCapture(r), snippet: r.snippet as string }));
  }

  /** Soft delete: tombstone the row (so the deletion can sync) and return the image path to unlink. */
  delete(workspaceId: string, id: string): string | undefined {
    const row = this.db.prepare(`SELECT image_path FROM captures WHERE id = ? AND workspace_id = ?`).get(id, workspaceId) as { image_path: string } | undefined;
    this.db.prepare(`UPDATE captures SET deleted = 1, dirty = 1, updated_at = ? WHERE id = ? AND workspace_id = ?`).run(Date.now(), id, workspaceId);
    return row?.image_path;
  }

  /** Free-tier retention sweep. Hard-deletes (free tier never syncs). Returns image paths to unlink. */
  applyRetention(workspaceId: string, days: number): string[] {
    const cutoff = Date.now() - days * 86_400_000;
    const rows = this.db.prepare(`SELECT image_path FROM captures WHERE workspace_id = ? AND created_at < ?`)
      .all(workspaceId, cutoff) as { image_path: string }[];
    this.db.prepare(`DELETE FROM captures WHERE workspace_id = ? AND created_at < ?`).run(workspaceId, cutoff);
    return rows.map(r => r.image_path);
  }

  stats(workspaceId: string): Stats {
    const n = (sql: string) => (this.db.prepare(sql).get(workspaceId) as { n: number }).n;
    return {
      total:       n(`SELECT COUNT(*) n FROM captures WHERE workspace_id = ? AND deleted = 0`),
      ocrIndexed:  n(`SELECT COUNT(*) n FROM captures WHERE workspace_id = ? AND deleted = 0 AND length(ocr_text) > 0`),
      sent:        n(`SELECT COUNT(*) n FROM events   WHERE workspace_id = ? AND kind = 'sent'`),
      piiRedacted: n(`SELECT COUNT(*) n FROM captures WHERE workspace_id = ? AND deleted = 0 AND has_pii = 1`),
    };
  }

  getAnnotationDocument(workspaceId: string, captureId: string): AnnotationDocument | null {
    const row = this.db.prepare(`SELECT data_json FROM capture_annotations WHERE capture_id = ? AND workspace_id = ?`)
      .get(captureId, workspaceId) as { data_json: string } | undefined;
    if (!row) return null;
    try { return deserialiseAnnotationDocument(row.data_json); }
    catch { return null; }
  }

  saveAnnotationDocument(workspaceId: string, captureId: string, doc: AnnotationDocument): void {
    this.db.prepare(
      `INSERT INTO capture_annotations (capture_id, workspace_id, data_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(capture_id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`
    ).run(captureId, workspaceId, serialiseAnnotationDocument(doc), Date.now());
  }

  createGuide(workspaceId: string, input: { title: string; type: GuideType; captureIds: string[] }): Guide {
    const now = Date.now();
    const id = randomUUID();
    const title = input.title.trim() || defaultGuideTitle(input.type);
    const captureIds = input.captureIds.filter(Boolean);
    const captures = captureIds
      .map(captureId => this.get(workspaceId, captureId))
      .filter((capture): capture is Capture => !!capture);

    const summary = defaultGuideSummary(input.type, captures.length);
    const insertGuide = this.db.prepare(
      `INSERT INTO guides (id, workspace_id, title, type, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertStep = this.db.prepare(
      `INSERT INTO guide_steps (id, guide_id, capture_id, step_order, title, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      insertGuide.run(id, workspaceId, title, input.type, summary, now, now);
      captures.forEach((capture, idx) => {
        insertStep.run(randomUUID(), id, capture.id, idx + 1, stepTitle(capture, idx), stepDescription(capture));
      });
    });
    tx();

    return this.getGuide(workspaceId, id)!;
  }

  listGuides(workspaceId: string): GuideListItem[] {
    const rows = this.db.prepare(
      `SELECT g.*, COUNT(s.id) AS step_count
       FROM guides g LEFT JOIN guide_steps s ON s.guide_id = g.id
       WHERE g.workspace_id = ?
       GROUP BY g.id
       ORDER BY g.updated_at DESC`
    ).all(workspaceId) as Record<string, unknown>[];
    return rows.map(toGuideListItem);
  }

  getGuide(workspaceId: string, id: string): Guide | undefined {
    const row = this.db.prepare(`SELECT * FROM guides WHERE id = ? AND workspace_id = ?`).get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const steps = this.db.prepare(
      `SELECT s.*, c.workspace_id, c.filename, c.image_path, c.tag, c.ocr_text, c.has_pii, c.created_at
       FROM guide_steps s
       JOIN captures c ON c.id = s.capture_id
       WHERE s.guide_id = ? AND c.workspace_id = ? AND c.deleted = 0
       ORDER BY s.step_order`
    ).all(id, workspaceId) as Record<string, unknown>[];
    return { ...toGuide(row), steps: steps.map(toGuideStep) };
  }

  updateGuide(workspaceId: string, guide: Guide): Guide | undefined {
    const existing = this.getGuide(workspaceId, guide.id);
    if (!existing) return undefined;

    const now = Date.now();
    const updateGuide = this.db.prepare(`UPDATE guides SET title = ?, type = ?, summary = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`);
    const deleteSteps = this.db.prepare(`DELETE FROM guide_steps WHERE guide_id = ?`);
    const insertStep = this.db.prepare(
      `INSERT INTO guide_steps (id, guide_id, capture_id, step_order, title, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const tx = this.db.transaction(() => {
      updateGuide.run(guide.title, guide.type, guide.summary, now, guide.id, workspaceId);
      deleteSteps.run(guide.id);
      guide.steps.forEach((step, idx) => {
        insertStep.run(step.id || randomUUID(), guide.id, step.captureId, idx + 1, step.title, step.description);
      });
    });
    tx();
    return this.getGuide(workspaceId, guide.id);
  }

  // ---- Sync support (cloud sync, architecture §6) -------------------------

  /** Local rows with unpushed changes (includes tombstones). */
  dirty(workspaceId: string, limit = 200): SyncRecord[] {
    const rows = this.db.prepare(
      `SELECT id, workspace_id, filename, tag, ocr_text, has_pii, created_at, updated_at, deleted
       FROM captures WHERE workspace_id = ? AND dirty = 1 ORDER BY updated_at LIMIT ?`
    ).all(workspaceId, limit) as Record<string, unknown>[];
    return rows.map(toSyncRecord);
  }

  markClean(ids: string[]): void {
    if (!ids.length) return;
    const stmt = this.db.prepare(`UPDATE captures SET dirty = 0 WHERE id = ?`);
    const tx = this.db.transaction((list: string[]) => list.forEach(id => stmt.run(id)));
    tx(ids);
  }

  /** Apply a remote record with last-write-wins on updated_at. Remote-origin rows start with no local image. */
  upsertRemote(r: SyncRecord): void {
    this.db.prepare(
      `INSERT INTO captures (id, workspace_id, filename, image_path, tag, ocr_text, has_pii, created_at, updated_at, deleted, dirty)
       VALUES (@id, @workspaceId, @filename, '', @tag, @ocrText, @hasPii, @createdAt, @updatedAt, @deleted, 0)
       ON CONFLICT(id) DO UPDATE SET
         filename = excluded.filename, tag = excluded.tag, ocr_text = excluded.ocr_text,
         has_pii = excluded.has_pii, updated_at = excluded.updated_at, deleted = excluded.deleted, dirty = 0
       WHERE excluded.updated_at > captures.updated_at`
    ).run({
      id: r.id, workspaceId: r.workspaceId, filename: r.filename, tag: r.tag,
      ocrText: r.ocrText, hasPii: r.hasPii ? 1 : 0, createdAt: r.createdAt, updatedAt: r.updatedAt, deleted: r.deleted ? 1 : 0,
    });
  }

  /** Captures present locally as metadata but missing their image file (need a lazy blob download). */
  missingImages(workspaceId: string, limit = 50): string[] {
    return (this.db.prepare(
      `SELECT id FROM captures WHERE workspace_id = ? AND deleted = 0 AND image_path = '' LIMIT ?`
    ).all(workspaceId, limit) as { id: string }[]).map(r => r.id);
  }

  setImagePath(id: string, path: string): void {
    this.db.prepare(`UPDATE captures SET image_path = ? WHERE id = ?`).run(path, id);
  }

  getCursor(workspaceId: string): number {
    const r = this.db.prepare(`SELECT cursor FROM sync_state WHERE workspace_id = ?`).get(workspaceId) as { cursor: number } | undefined;
    return r?.cursor ?? 0;
  }

  setCursor(workspaceId: string, cursor: number): void {
    this.db.prepare(
      `INSERT INTO sync_state (workspace_id, cursor) VALUES (?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET cursor = excluded.cursor`
    ).run(workspaceId, cursor);
  }
}

function toCapture(r: Record<string, unknown>): Capture {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    filename: r.filename as string,
    imagePath: r.image_path as string,
    tag: (r.tag as Capture['tag']) ?? null,
    ocrText: (r.ocr_text as string) ?? '',
    hasPii: !!r.has_pii,
    createdAt: r.created_at as number,
    hasAnnotations: !!r.has_annotations,
  };
}

function toGuide(r: Record<string, unknown>): Omit<Guide, 'steps'> {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    title: r.title as string,
    type: r.type as GuideType,
    summary: (r.summary as string) ?? '',
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

function toGuideListItem(r: Record<string, unknown>): GuideListItem {
  return {
    ...toGuide(r),
    stepCount: Number(r.step_count ?? 0),
  };
}

function toGuideStep(r: Record<string, unknown>): GuideStep {
  return {
    id: r.id as string,
    captureId: r.capture_id as string,
    order: r.step_order as number,
    title: r.title as string,
    description: (r.description as string) ?? '',
    capture: toCapture(r),
  };
}

function defaultGuideTitle(type: GuideType): string {
  const labels: Record<GuideType, string> = {
    sop: 'New SOP guide',
    bug_report: 'New bug report',
    training: 'New training guide',
    validation: 'New validation walkthrough',
    walkthrough: 'New walkthrough',
  };
  return labels[type];
}

function defaultGuideSummary(type: GuideType, count: number): string {
  const plural = count === 1 ? 'capture' : 'captures';
  return `${defaultGuideTitle(type)} created from ${count} ${plural}.`;
}

function stepTitle(capture: Capture, idx: number): string {
  return `Step ${idx + 1}: ${capture.filename}`;
}

function stepDescription(capture: Capture): string {
  const text = (capture.ocrText ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Describe what the user should do or verify in this capture.';
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function toSyncRecord(r: Record<string, unknown>): SyncRecord {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    filename: r.filename as string,
    tag: (r.tag as ContentTag | null) ?? null,
    ocrText: (r.ocr_text as string) ?? '',
    hasPii: !!r.has_pii,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deleted: !!r.deleted,
  };
}

/** Turn free text into a safe FTS5 prefix query: "err log" -> "err* log*". */
function toFtsQuery(q: string): string {
  const terms = q.trim().replace(/["*]/g, ' ').split(/\s+/).filter(Boolean);
  return terms.map(t => `${t}*`).join(' ');
}
