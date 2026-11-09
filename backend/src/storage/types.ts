export interface BlobStorage {
  /** Store bytes at a stable key (e.g. `accountId/captureId.png`). */
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** When the driver serves files from disk, return an absolute path for sendFile; otherwise null. */
  localPath(key: string): string | null;
}

export function blobKey(accountId: string, captureId: string): string {
  return `${accountId}/${captureId}.png`;
}
