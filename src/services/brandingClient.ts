export type SubscriptionPlan = 'free' | 'trial' | 'basic' | 'pro' | 'enterprise';

export interface WorkspaceBranding {
  workspaceId: string;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  directorName: string;
  leadEstimatorName: string;
  logoFileName?: string;
  logoUrl?: string;
  logoMimeType?: string;
  accentColor?: string;
  subscriptionPlan: SubscriptionPlan;
  isWatermarkRequired: boolean;
  canUploadLogo: boolean;
  updatedAt: string;
}

const API_BASE = (typeof window !== 'undefined' && (window as any).__EZRAB_API_BASE__) || 'http://localhost:3001';

export class BrandingClient {
  /**
   * Fetch workspace branding and subscription entitlement
   */
  public async getBranding(workspaceId: string = 'ws-default-ezrab'): Promise<WorkspaceBranding> {
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/branding`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.branding) {
          return json.branding;
        }
      }
    } catch (e) {
      console.warn('[BrandingClient] Backend offline or unreachable, using local fallback:', e);
    }

    // Local storage / state fallback if backend server is not running
    const local = this.getLocalFallback(workspaceId);
    return local;
  }

  /**
   * Update text metadata of company branding
   */
  public async updateBranding(
    workspaceId: string,
    data: Partial<WorkspaceBranding>
  ): Promise<WorkspaceBranding> {
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.branding) {
          return json.branding;
        }
      }
    } catch (e) {
      console.warn('[BrandingClient] Failed to update backend, saving locally:', e);
    }

    // Update local cache
    const current = this.getLocalFallback(workspaceId);
    const updated: WorkspaceBranding = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.saveLocalFallback(workspaceId, updated);
    return updated;
  }

  /**
   * Upload logo file (enforcing paid entitlement at backend)
   */
  public async uploadLogo(
    workspaceId: string,
    file: File
  ): Promise<{ success: boolean; branding: WorkspaceBranding; logoUrl: string }> {
    // 1. Client-side sanity validation
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Ukuran file logo maksimal adalah 2 MB.');
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      throw new Error('Format file tidak didukung. Harap gunakan PNG, JPG/JPEG, atau WebP.');
    }

    // Convert file to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // 2. Call backend endpoint to enforce subscription & binary magic bytes
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/branding/logo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data, mime: file.type }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = json?.error?.message || 'Gagal mengunggah logo ke server.';
      throw new Error(errorMsg);
    }

    return {
      success: true,
      branding: json.branding,
      logoUrl: json.logoUrl,
    };
  }

  /**
   * Delete company logo
   */
  public async deleteLogo(workspaceId: string): Promise<WorkspaceBranding> {
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/branding/logo`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.branding) {
          return json.branding;
        }
      }
    } catch (e) {
      console.warn('[BrandingClient] Backend call failed, clearing locally:', e);
    }

    const current = this.getLocalFallback(workspaceId);
    current.logoUrl = undefined;
    current.logoFileName = undefined;
    this.saveLocalFallback(workspaceId, current);
    return current;
  }

  /**
   * Change subscription tier for testing & QA validation
   */
  public async setTestTier(workspaceId: string, plan: SubscriptionPlan): Promise<WorkspaceBranding> {
    try {
      const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}/subscription/test-tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.branding) {
          return json.branding;
        }
      }
    } catch (e) {
      console.warn('[BrandingClient] Could not set test tier on backend:', e);
    }

    const current = this.getLocalFallback(workspaceId);
    current.subscriptionPlan = plan;
    current.isWatermarkRequired = plan === 'free' || plan === 'trial';
    current.canUploadLogo = !current.isWatermarkRequired;
    this.saveLocalFallback(workspaceId, current);
    return current;
  }

  private getLocalFallback(workspaceId: string): WorkspaceBranding {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`ezrab_branding_${workspaceId}`);
        if (raw) return JSON.parse(raw);
      } catch {}
    }

    // P0-B data-integrity fix (2026-10-09): identity fields MUST be empty when
    // the user has not filled them. Previously this returned a fabricated
    // company ("PT EZRAB KONSTRUKSI DIGITAL", fake NPWP/phone/director),
    // which flowed straight into PDF/Excel exports as if it were the user's
    // real company. Empty = UI shows "Belum diisi" + warning banner.
    return {
      workspaceId,
      companyName: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      taxNumber: '',
      directorName: '',
      leadEstimatorName: '',
      subscriptionPlan: 'pro',
      isWatermarkRequired: false,
      canUploadLogo: true,
      updatedAt: new Date().toISOString(),
    };
  }

  private saveLocalFallback(workspaceId: string, branding: WorkspaceBranding): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`ezrab_branding_${workspaceId}`, JSON.stringify(branding));
      } catch {}
    }
  }
}

export const brandingClient = new BrandingClient();
