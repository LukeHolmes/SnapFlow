import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { config } from '../config';
import type { BlobStorage } from './types';

export class LocalDiskBlobStorage implements BlobStorage {
  private root: string;

  constructor(root = join(config.dataDir, 'blobs')) {
    this.root = root;
    mkdirSync(this.root, { recursive: true });
  }

  private abs(key: string): string {
    const path = join(this.root, key);
    mkdirSync(dirname(path), { recursive: true });
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    writeFileSync(this.abs(key), data);
  }

  async get(key: string): Promise<Buffer | null> {
    const path = this.abs(key);
    if (!existsSync(path)) return null;
    return readFileSync(path);
  }

  async delete(key: string): Promise<void> {
    const path = this.abs(key);
    if (existsSync(path)) unlinkSync(path);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.abs(key));
  }

  localPath(key: string): string | null {
    const path = this.abs(key);
    return existsSync(path) ? path : null;
  }
}
