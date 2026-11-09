import { config } from '../config';
import { LocalDiskBlobStorage } from './local';
import { S3BlobStorage } from './s3';
import type { BlobStorage } from './types';

let instance: BlobStorage | null = null;

export function blobStorage(): BlobStorage {
  if (!instance) {
    instance = config.blobStorageDriver === 's3' ? new S3BlobStorage() : new LocalDiskBlobStorage();
  }
  return instance;
}

/** Reset singleton (tests). */
export function _resetBlobStorage(): void {
  instance = null;
}

export type { BlobStorage } from './types';
export { blobKey } from './types';
