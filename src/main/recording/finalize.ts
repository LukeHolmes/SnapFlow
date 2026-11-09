import type { Capture } from '../../shared/types';
import type { Engine } from '../engine';

export function finalizeRecording(args: {
  engine: Engine;
  id: string;
  filename: string;
  thumbPath: string;
  webmPath: string;
  durationMs: number;
  byteSize: number;
}): Capture {
  const { engine, id, filename, thumbPath, webmPath, durationMs, byteSize } = args;
  const capture: Capture = {
    id,
    workspaceId: engine.workspace,
    filename,
    imagePath: thumbPath,
    kind: 'recording',
    tag: 'recording',
    ocrText: `Screen recording (${Math.round(durationMs / 1000)}s)`,
    hasPii: false,
    createdAt: Date.now(),
    mediaPath: webmPath,
    durationMs,
    byteSize,
  };
  engine.history.insert(capture);
  engine.events.append(engine.workspace, 'recording', `${filename} saved (${formatBytes(byteSize)})`);
  engine.events.append(engine.workspace, 'tag', "Auto-tagged as 'recording'");
  return capture;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
