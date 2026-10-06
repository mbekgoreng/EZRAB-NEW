import fs from 'fs';
import path from 'path';

export interface IBrandingStorageAdapter {
  saveLogo(workspaceId: string, filename: string, buffer: Buffer, mimeType: string): Promise<void>;
  readLogo(workspaceId: string, filename: string, mimeType?: string): Promise<{ buffer: Buffer; mimeType: string } | null>;
  deleteLogo(workspaceId: string, filename: string): Promise<void>;
}

/**
 * Local persistent disk storage adapter (Default for containerized / Node.js servers)
 */
export class LocalDiskBrandingStorage implements IBrandingStorageAdapter {
  private baseDir: string;

  constructor(customDir?: string) {
    this.baseDir = customDir || path.resolve(process.cwd(), 'server', 'storage', 'branding');
    this.ensureDir(this.baseDir);
  }

  private ensureDir(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      console.warn('[LocalDiskBrandingStorage] Could not create directory:', e);
    }
  }

  public async saveLogo(workspaceId: string, filename: string, buffer: Buffer): Promise<void> {
    const wsDir = path.join(this.baseDir, workspaceId);
    this.ensureDir(wsDir);
    const target = path.join(wsDir, filename);
    fs.writeFileSync(target, buffer);
  }

  public async readLogo(workspaceId: string, filename: string, mimeType: string = 'image/png'): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const target = path.join(this.baseDir, workspaceId, filename);
    if (!fs.existsSync(target)) return null;
    const buffer = fs.readFileSync(target);
    return { buffer, mimeType };
  }

  public async deleteLogo(workspaceId: string, filename: string): Promise<void> {
    const target = path.join(this.baseDir, workspaceId, filename);
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch (e) {
        console.warn('[LocalDiskBrandingStorage] Could not unlink logo:', e);
      }
    }
  }
}

/**
 * Supabase Storage Adapter for Serverless deployment (Vercel / Cloud Functions / Supabase Cloud)
 */
export class SupabaseBrandingStorage implements IBrandingStorageAdapter {
  private supabaseUrl: string;
  private serviceKey: string;
  private bucket: string;

  constructor(supabaseUrl: string, serviceKey: string, bucket = 'workspace-branding') {
    this.supabaseUrl = supabaseUrl.replace(/\/$/, '');
    this.serviceKey = serviceKey;
    this.bucket = bucket;
  }

  public async saveLogo(workspaceId: string, filename: string, buffer: Buffer, mimeType: string): Promise<void> {
    const objectPath = `${workspaceId}/${filename}`;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/${this.bucket}/${objectPath}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[SupabaseBrandingStorage] Upload error (${res.status}):`, errText);
    }
  }

  public async readLogo(workspaceId: string, filename: string, mimeType: string = 'image/png'): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const objectPath = `${workspaceId}/${filename}`;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${objectPath}`;

    try {
      const res = await fetch(endpoint);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuf),
        mimeType: res.headers.get('content-type') || mimeType,
      };
    } catch {
      return null;
    }
  }

  public async deleteLogo(workspaceId: string, filename: string): Promise<void> {
    const objectPath = `${workspaceId}/${filename}`;
    const endpoint = `${this.supabaseUrl}/storage/v1/object/${this.bucket}`;

    await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [objectPath] }),
    }).catch((e) => console.warn('[SupabaseBrandingStorage] Delete error:', e));
  }
}

/**
 * Storage Factory: Automatically picks Supabase persistent storage if credentials are configured;
 * otherwise uses persistent local filesystem storage.
 */
export function createBrandingStorage(): IBrandingStorageAdapter {
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (sbUrl && sbKey) {
    return new SupabaseBrandingStorage(sbUrl, sbKey);
  }

  return new LocalDiskBrandingStorage();
}
