import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type SubscriptionPlan = 'free' | 'trial' | 'basic' | 'pro' | 'enterprise';

export interface WorkspaceBranding {
  workspaceId: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string; // NPWP
  directorName: string;
  leadEstimatorName: string;
  logoFileName?: string;
  logoUrl?: string; // Data URI or server endpoint URL
  logoMimeType?: string;
  accentColor?: string;
  subscriptionPlan: SubscriptionPlan;
  isWatermarkRequired: boolean;
  canUploadLogo: boolean;
  updatedAt: string;
}

const STORAGE_ROOT = path.resolve(process.cwd(), 'server', 'storage', 'branding');

// Allowed MIME types and their magic bytes
interface MimeSignature {
  mime: string;
  extension: string;
  match: (buffer: Buffer) => boolean;
}

const ALLOWED_MIME_SIGNATURES: MimeSignature[] = [
  {
    mime: 'image/png',
    extension: 'png',
    match: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    match: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    match: (buf) =>
      buf.length >= 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP',
  },
];

import { createBrandingStorage, IBrandingStorageAdapter } from './brandingStorage';

export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export class BrandingService {
  private brandings: Map<string, WorkspaceBranding> = new Map();
  private storage: IBrandingStorageAdapter;

  constructor(customStorage?: IBrandingStorageAdapter) {
    this.storage = customStorage || createBrandingStorage();
    this.seedDefaultBrandings();
  }

  private seedDefaultBrandings(): void {
    // Default workspace 1: PRO tier (Paid)
    this.brandings.set('ws-default-ezrab', {
      workspaceId: 'ws-default-ezrab',
      companyName: 'PT EZRAB KONSTRUKSI DIGITAL',
      address: 'SCBD District 8, Jakarta Selatan 12190',
      phone: '+62 21 5088-9900',
      email: 'kontak@ezrab.co.id',
      website: 'https://ezrab.co.id',
      taxNumber: '01.234.567.8-012.000',
      directorName: 'Ir. Ahmad Yusuf, M.T.',
      leadEstimatorName: 'Ahmad Yusuf (Super Admin)',
      subscriptionPlan: 'pro',
      isWatermarkRequired: false,
      canUploadLogo: true,
      updatedAt: new Date().toISOString(),
    });

    // Default workspace 2: FREE / TRIAL tier
    this.brandings.set('ws-free-sample', {
      workspaceId: 'ws-free-sample',
      companyName: 'Kontraktor Mandiri Sejahtera',
      address: 'Bandung, Jawa Barat',
      phone: '+62 22 7100-2211',
      email: 'admin@mandiri.id',
      website: '',
      taxNumber: '-',
      directorName: 'Bambang Supriyanto',
      leadEstimatorName: 'Bambang Supriyanto',
      subscriptionPlan: 'free',
      isWatermarkRequired: true,
      canUploadLogo: false,
      updatedAt: new Date().toISOString(),
    });
  }

  public isPaidPlan(plan: SubscriptionPlan): boolean {
    return plan === 'basic' || plan === 'pro' || plan === 'enterprise';
  }

  /**
   * Get branding info for a workspace. If not found, initializes default based on requested plan.
   */
  public getBranding(workspaceId: string): WorkspaceBranding {
    const existing = this.brandings.get(workspaceId);
    if (existing) {
      return { ...existing };
    }

    const defaultPlan: SubscriptionPlan = 'free';
    const isPaid = this.isPaidPlan(defaultPlan);
    const newBranding: WorkspaceBranding = {
      workspaceId,
      companyName: 'EZRAB Construction Estimator',
      address: 'Indonesia',
      phone: '-',
      email: 'estimator@ezrab.id',
      website: 'https://ezrab.id',
      taxNumber: '-',
      directorName: 'Direktur Perusahaan',
      leadEstimatorName: 'Lead Estimator',
      subscriptionPlan: defaultPlan,
      isWatermarkRequired: !isPaid,
      canUploadLogo: isPaid,
      updatedAt: new Date().toISOString(),
    };

    this.brandings.set(workspaceId, newBranding);
    return { ...newBranding };
  }

  /**
   * Update text metadata of company branding
   */
  public updateBranding(
    workspaceId: string,
    patch: Partial<Omit<WorkspaceBranding, 'workspaceId' | 'subscriptionPlan' | 'isWatermarkRequired' | 'canUploadLogo' | 'logoFileName' | 'logoUrl'>>
  ): WorkspaceBranding {
    const current = this.getBranding(workspaceId);
    const updated: WorkspaceBranding = {
      ...current,
      companyName: typeof patch.companyName === 'string' ? patch.companyName.trim().slice(0, 160) : current.companyName,
      address: typeof patch.address === 'string' ? patch.address.trim().slice(0, 300) : current.address,
      phone: typeof patch.phone === 'string' ? patch.phone.trim().slice(0, 50) : current.phone,
      email: typeof patch.email === 'string' ? patch.email.trim().slice(0, 100) : current.email,
      website: typeof patch.website === 'string' ? patch.website.trim().slice(0, 150) : current.website,
      taxNumber: typeof patch.taxNumber === 'string' ? patch.taxNumber.trim().slice(0, 50) : current.taxNumber,
      directorName: typeof patch.directorName === 'string' ? patch.directorName.trim().slice(0, 100) : current.directorName,
      leadEstimatorName: typeof patch.leadEstimatorName === 'string' ? patch.leadEstimatorName.trim().slice(0, 100) : current.leadEstimatorName,
      accentColor: typeof patch.accentColor === 'string' ? patch.accentColor.trim().slice(0, 20) : current.accentColor,
      updatedAt: new Date().toISOString(),
    };

    this.brandings.set(workspaceId, updated);
    return { ...updated };
  }

  /**
   * Updates subscription plan (used for testing or payment webhook integration)
   */
  public setSubscriptionPlan(workspaceId: string, plan: SubscriptionPlan): WorkspaceBranding {
    const current = this.getBranding(workspaceId);
    const isPaid = this.isPaidPlan(plan);
    const updated: WorkspaceBranding = {
      ...current,
      subscriptionPlan: plan,
      isWatermarkRequired: !isPaid,
      canUploadLogo: isPaid,
      updatedAt: new Date().toISOString(),
    };

    this.brandings.set(workspaceId, updated);
    return { ...updated };
  }

  /**
   * Uploads and validates company logo.
   * Enforces paid plan entitlement and strict binary verification.
   */
  public uploadLogo(
    workspaceId: string,
    fileBuffer: Buffer,
    declaredMime?: string
  ): { success: boolean; branding: WorkspaceBranding; logoUrl: string } {
    const current = this.getBranding(workspaceId);

    // 1. Enforce Subscription Entitlement at Backend
    if (!this.isPaidPlan(current.subscriptionPlan)) {
      throw new Error('SUBSCRIPTION_REQUIRED: Upload logo perusahaan tersedia untuk paket berbayar.');
    }

    // 2. Validate file size (max 2MB)
    if (fileBuffer.length > MAX_LOGO_SIZE_BYTES) {
      throw new Error('FILE_TOO_LARGE: Ukuran file logo maksimal adalah 2 MB.');
    }

    if (fileBuffer.length < 32) {
      throw new Error('INVALID_IMAGE: File gambar rusak atau kosong.');
    }

    // 3. Inspect magic bytes header to verify true MIME type
    const matchedSig = ALLOWED_MIME_SIGNATURES.find((sig) => sig.match(fileBuffer));
    if (!matchedSig) {
      throw new Error('INVALID_MIME: Format file tidak didukung. Harap gunakan PNG, JPG/JPEG, atau WebP.');
    }

    // 4. Delete old logo if exists to avoid orphaned storage
    if (current.logoFileName) {
      this.storage.deleteLogo(workspaceId, current.logoFileName).catch(() => {});
    }

    // 5. Generate secure internal random filename (Never trust client filename)
    const randomName = `logo_${crypto.randomBytes(12).toString('hex')}.${matchedSig.extension}`;
    this.storage.saveLogo(workspaceId, randomName, fileBuffer, matchedSig.mime).catch((e) => {
      console.warn('[BrandingService] Could not persist logo in storage:', e);
    });

    // 6. Base64 Data URI for immediate PDF inclusion without external HTTP calls
    const base64DataUri = `data:${matchedSig.mime};base64,${fileBuffer.toString('base64')}`;

    const updated: WorkspaceBranding = {
      ...current,
      logoFileName: randomName,
      logoUrl: base64DataUri,
      logoMimeType: matchedSig.mime,
      updatedAt: new Date().toISOString(),
    };

    this.brandings.set(workspaceId, updated);
    return {
      success: true,
      branding: updated,
      logoUrl: base64DataUri,
    };
  }

  /**
   * Delete company logo and return to default
   */
  public deleteLogo(workspaceId: string): WorkspaceBranding {
    const current = this.getBranding(workspaceId);
    if (current.logoFileName) {
      this.storage.deleteLogo(workspaceId, current.logoFileName).catch(() => {});
    }

    const updated: WorkspaceBranding = {
      ...current,
      logoFileName: undefined,
      logoUrl: undefined,
      logoMimeType: undefined,
      updatedAt: new Date().toISOString(),
    };

    this.brandings.set(workspaceId, updated);
    return { ...updated };
  }

  /**
   * Read raw logo file buffer from persistent storage adapter
   */
  public async getLogoFile(workspaceId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const branding = this.getBranding(workspaceId);
    if (!branding.logoFileName) return null;

    return await this.storage.readLogo(workspaceId, branding.logoFileName, branding.logoMimeType);
  }
}

export const brandingService = new BrandingService();
