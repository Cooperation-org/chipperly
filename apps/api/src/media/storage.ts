import { createHash, createHmac } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { env } from '../env.js';

export interface StoredObject {
  readonly stream: Readable;
  readonly contentType: string;
  readonly size: number;
}

export interface StorageDriver {
  put(key: string, data: Buffer | Readable, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  publicUrl?(key: string): string;
}

function assertSafeKey(key: string): void {
  if (key.length === 0 || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error(`unsafe storage key: ${key}`);
  }
}

async function toBuffer(data: Buffer | Readable): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  const chunks: Buffer[] = [];
  for await (const chunk of data) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Writes under UPLOAD_DIR. Content type is kept in a `<file>.contenttype` sidecar (plain FS has no metadata). */
export class LocalDriver implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    return path.join(this.baseDir, key);
  }

  async put(key: string, data: Buffer | Readable, contentType: string): Promise<void> {
    const filePath = this.resolve(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await writeFile(filePath, data);
    } else {
      await pipeline(data, createWriteStream(filePath));
    }
    await writeFile(`${filePath}.contenttype`, contentType, 'utf8');
  }

  async get(key: string): Promise<StoredObject | null> {
    const filePath = this.resolve(key);
    try {
      const info = await stat(filePath);
      let contentType = 'application/octet-stream';
      try {
        contentType = (await readFile(`${filePath}.contenttype`, 'utf8')).trim();
      } catch {
        // No sidecar (e.g. file dropped in by hand); fall back to the generic type above.
      }
      return { stream: createReadStream(filePath), contentType, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await Promise.allSettled([unlink(filePath), unlink(`${filePath}.contenttype`)]);
  }
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/**
 * Any S3-compatible bucket (R2, B2, MinIO, AWS itself) via SigV4, no SDK.
 * `region` is fixed to `auto`, which R2 and most S3-compatible services
 * accept regardless of where the bucket actually lives.
 */
export class S3Driver implements StorageDriver {
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region = 'auto';

  constructor(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
  }

  // SigV4 needs the exact payload hash up front, so PUT bodies are buffered
  // fully before signing rather than streamed.
  private async signedRequest(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    assertSafeKey(key);
    const host = new URL(this.endpoint).host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}Z$/g, '') + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const payloadHash = sha256Hex(body ?? Buffer.alloc(0));

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const key_ = signingKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = createHmac('sha256', key_).update(stringToSign, 'utf8').digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(`${this.endpoint}${canonicalUri}`, {
      method,
      headers: { ...headers, Authorization: authorization },
      body: method === 'PUT' ? body : undefined,
    });
  }

  async put(key: string, data: Buffer | Readable, contentType: string): Promise<void> {
    const buffer = await toBuffer(data);
    const response = await this.signedRequest('PUT', key, buffer, contentType);
    if (!response.ok) {
      throw new Error(`S3 put ${key} failed: ${response.status} ${await response.text()}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const response = await this.signedRequest('GET', key);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 get ${key} failed: ${response.status} ${await response.text()}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      stream: Readable.from(buffer),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      size: buffer.length,
    };
  }

  async delete(key: string): Promise<void> {
    const response = await this.signedRequest('DELETE', key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete ${key} failed: ${response.status} ${await response.text()}`);
    }
  }

  publicUrl(key: string): string {
    if (!env.MEDIA_PUBLIC_BASE) {
      throw new Error('MEDIA_PUBLIC_BASE is not set');
    }
    return `${env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  }
}

let driver: StorageDriver | undefined;

export function getStorageDriver(): StorageDriver {
  if (driver) return driver;
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY');
    }
    driver = new S3Driver(env.S3_ENDPOINT, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY);
  } else {
    driver = new LocalDriver(path.resolve(env.UPLOAD_DIR));
  }
  return driver;
}
