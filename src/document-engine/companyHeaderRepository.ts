import JSZip from 'jszip';

export type HeaderType = 'IMAGE' | 'TEXT' | 'DOCX_EXTRACTED';
export type HeaderSlot = 'PRIMARY' | 'ALTERNATIVE' | 'ARCHIVED';

export interface CompanyHeaderAsset {
  id: string;
  name: string;
  slot: HeaderSlot;
  type: HeaderType;
  content: string; // Base64 data URL for image, or text/HTML snippet for text/docx
  extractedText?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'ezrab:company:headers';

export class CompanyHeaderRepository {
  private headers: CompanyHeaderAsset[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        this.headers = raw ? JSON.parse(raw) : [];
      } catch {
        this.headers = [];
      }
    }
  }

  private persist(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.headers));
      } catch (err) {
        console.warn('[CompanyHeaderRepository] Failed to persist headers:', err);
      }
    }
  }

  list(): CompanyHeaderAsset[] {
    this.load();
    return [...this.headers].sort((a, b) => {
      if (a.slot === 'PRIMARY') return -1;
      if (b.slot === 'PRIMARY') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  getById(id: string): CompanyHeaderAsset | undefined {
    this.load();
    return this.headers.find(h => h.id === id);
  }

  getPrimary(): CompanyHeaderAsset | undefined {
    this.load();
    return this.headers.find(h => h.slot === 'PRIMARY') || this.headers[0];
  }

  save(header: CompanyHeaderAsset): void {
    this.load();
    // If setting as primary, demote other primary
    if (header.slot === 'PRIMARY') {
      this.headers.forEach(h => {
        if (h.id !== header.id && h.slot === 'PRIMARY') {
          h.slot = 'ALTERNATIVE';
        }
      });
    }

    const idx = this.headers.findIndex(h => h.id === header.id);
    if (idx >= 0) {
      this.headers[idx] = { ...header, updatedAt: new Date().toISOString() };
    } else {
      this.headers.push({
        ...header,
        createdAt: header.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    this.persist();
  }

  setPrimary(id: string): void {
    this.load();
    this.headers.forEach(h => {
      h.slot = h.id === id ? 'PRIMARY' : h.slot === 'PRIMARY' ? 'ALTERNATIVE' : h.slot;
    });
    this.persist();
  }

  delete(id: string): void {
    this.load();
    this.headers = this.headers.filter(h => h.id !== id);
    this.persist();
  }

  clearAll(): void {
    this.headers = [];
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }

  importFromImage(dataUrl: string, name = 'Kop Gambar Perusahaan'): CompanyHeaderAsset {
    const isPrimary = this.headers.length === 0;
    const asset: CompanyHeaderAsset = {
      id: `hdr-img-${Date.now()}`,
      name,
      slot: isPrimary ? 'PRIMARY' : 'ALTERNATIVE',
      type: 'IMAGE',
      content: dataUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.save(asset);
    return asset;
  }

  importFromText(text: string, name = 'Kop Teks Perusahaan'): CompanyHeaderAsset {
    const isPrimary = this.headers.length === 0;
    const asset: CompanyHeaderAsset = {
      id: `hdr-txt-${Date.now()}`,
      name,
      slot: isPrimary ? 'PRIMARY' : 'ALTERNATIVE',
      type: 'TEXT',
      content: text,
      extractedText: text,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.save(asset);
    return asset;
  }

  /**
   * Extracts text runs and basic header paragraphs from an uploaded DOCX file
   */
  async importFromDocx(buffer: ArrayBuffer | Blob, name = 'Kop Impor DOCX'): Promise<CompanyHeaderAsset> {
    const arrayBuffer = buffer instanceof Blob ? await buffer.arrayBuffer() : buffer;
    const zip = await JSZip.loadAsync(arrayBuffer);

    let extracted = '';
    // Look for header1.xml or document.xml top paragraphs
    const headerFile = zip.file(/word\/header\d+\.xml/)[0] || zip.file('word/document.xml');
    if (headerFile) {
      const xml = await headerFile.async('string');
      // Extract <w:t> tags
      const textMatches = xml.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (textMatches) {
        extracted = textMatches
          .map(t => t.replace(/<[^>]+>/g, '').trim())
          .filter(Boolean)
          .join('\n');
      }
    }

    const isPrimary = this.headers.length === 0;
    const asset: CompanyHeaderAsset = {
      id: `hdr-docx-${Date.now()}`,
      name,
      slot: isPrimary ? 'PRIMARY' : 'ALTERNATIVE',
      type: 'DOCX_EXTRACTED',
      content: extracted || 'Header Perusahaan (DOCX)',
      extractedText: extracted,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.save(asset);
    return asset;
  }
}
