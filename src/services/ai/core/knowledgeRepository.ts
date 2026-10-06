/**
 * EZRAB CORE AI — KNOWLEDGE REPOSITORY
 * 
 * Stratified 5-tier domain knowledge repository.
 * Tiers:
 * 1. OFFICIAL: Kementerian PUPR standards, SNI, Indonesian regulations.
 * 2. SYSTEM: EZRAB platform rules, SafeDecimal arithmetic, tool permissions.
 * 3. DOMAIN: Construction engineering methodology, QTO formulas, trade sequences.
 * 4. PROJECT: Active project parameters, contract data, location, AHSP version.
 * 5. USER: User preferences and explicit instructions.
 * 
 * Strict Principle:
 * - Knowledge repository provides engineering context and methodology.
 * - Knowledge repository is NEVER the source of truth for official AHSP codes,
 *   coefficients, resource prices, or arithmetic totals (those belong to databases and SafeDecimalEngine).
 */

export type KnowledgeTier = 'OFFICIAL' | 'SYSTEM' | 'DOMAIN' | 'PROJECT' | 'USER';

export interface KnowledgeItem {
  id: string;
  tier: KnowledgeTier;
  title: string;
  category: string;
  content: string;
  tags: string[];
  referenceCode?: string;
  sourceDocument?: string;
  isImmutable: boolean;
}

export class KnowledgeRepository {
  private static instance: KnowledgeRepository | null = null;
  private items: Map<string, KnowledgeItem> = new Map();

  private constructor() {
    this.seedOfficialKnowledge();
    this.seedSystemKnowledge();
    this.seedDomainKnowledge();
  }

  public static getInstance(): KnowledgeRepository {
    if (!KnowledgeRepository.instance) {
      KnowledgeRepository.instance = new KnowledgeRepository();
    }
    return KnowledgeRepository.instance;
  }

  private seedOfficialKnowledge(): void {
    const officialItems: KnowledgeItem[] = [
      {
        id: 'OFF-01',
        tier: 'OFFICIAL',
        title: 'Pedoman AHSP Bidang Bina Marga & Cipta Karya PUPR 2026',
        category: 'AHSP_STANDARD',
        content: 'Analisa Harga Satuan Pekerjaan (AHSP) resmi Kementerian PUPR 2026 menggunakan koefisien tenaga kerja, bahan, dan peralatan baku. Format kode standar mengacu pada Peraturan Menteri PUPR No. 1 Tahun 2022 dan revisi SE 2026.',
        tags: ['pupr', 'ahsp', 'standar', 'sni', 'koefisien'],
        referenceCode: 'PUPR-2026',
        isImmutable: true,
      },
      {
        id: 'OFF-02',
        tier: 'OFFICIAL',
        title: 'SNI 2847:2019 Persyaratan Beton Struktural untuk Bangunan Gedung',
        category: 'CONCRETE_STANDARD',
        content: 'Standar nasional untuk perancangan struktur beton bertulang, selimut beton minimum (40mm untuk tanah langsung, 20mm untuk pelat dalam), rasio tulangan, dan rasio air semen.',
        tags: ['beton', 'sni', 'struktur', 'tulangan', 'selimut beton'],
        referenceCode: 'SNI-2847-2019',
        isImmutable: true,
      },
      {
        id: 'OFF-03',
        tier: 'OFFICIAL',
        title: 'Peraturan Menteri PUPR tentang Standar Keselamatan Konstruksi (SMKK)',
        category: 'SAFETY_STANDARD',
        content: 'Ketentuan keselamatan dan kesehatan kerja konstruksi, APD standar, manajemen lalu lintas kerja, dan dokumen RKK/JSA.',
        tags: ['smkk', 'k3', 'keselamatan', 'apd', 'jsa'],
        referenceCode: 'SMKK-PUPR',
        isImmutable: true,
      },
    ];

    for (const it of officialItems) {
      this.items.set(it.id, it);
    }
  }

  private seedSystemKnowledge(): void {
    const systemItems: KnowledgeItem[] = [
      {
        id: 'SYS-01',
        tier: 'SYSTEM',
        title: 'Prinsip Ketat Zero AI Math & SafeDecimalEngine',
        category: 'SYSTEM_RULE',
        content: 'AI dilarang melakukan perhitungan aritmatika langsung pada prompt. Seluruh perkalian, pembagian, penjumlahan koefisien, dan volume harus dieksekusi oleh SafeDecimalEngine menggunakan 4-decimal scaled integer precision.',
        tags: ['safedecimal', 'presisi', 'matematika', 'tanpa floating drift'],
        isImmutable: true,
      },
      {
        id: 'SYS-02',
        tier: 'SYSTEM',
        title: 'Hierarki Resolusi Harga 4 Tingkat',
        category: 'SYSTEM_RULE',
        content: 'Harga resmi diperoleh melalui 4 tingkatan terstruktur: 1. Project Override (Database Proyek) -> 2. Workspace Catalog -> 3. Regional Database -> 4. Master HSD 2026 Nasional. Dilarang menggunakan persentase fiktif 60/35/5.',
        tags: ['harga', 'hsd', 'resolver', 'tier', 'katalog'],
        isImmutable: true,
      },
      {
        id: 'SYS-03',
        tier: 'SYSTEM',
        title: '3-Tier Action Permission Matrix',
        category: 'SECURITY',
        content: 'Tool dibedakan menjadi: INFORMATION (Read-only, no approval), SUGGESTION (Advisory, no mutation), ACTION (Mutation-capable, menghasilkan AIActionProposal dengan preview, wajib konfirmasi user).',
        tags: ['security', 'approval', 'action proposal', 'mutation'],
        isImmutable: true,
      },
    ];

    for (const it of systemItems) {
      this.items.set(it.id, it);
    }
  }

  private seedDomainKnowledge(): void {
    const domainItems: KnowledgeItem[] = [
      {
        id: 'DOM-01',
        tier: 'DOMAIN',
        title: 'Metodologi QTO Pondasi Batu Kali Trapesium',
        category: 'QTO_METHODOLOGY',
        content: 'Volume pondasi batu kali trapesium dihitung dengan rumus: ((Lebar Atas + Lebar Bawah) / 2) × Tinggi Pondasi × Panjang Total. Jika lebar atas 0.3m, lebar bawah 0.6m, tinggi 0.8m, panjang 48m, maka luas penampang 0.36 m² dan volume = 17.28 m³.',
        tags: ['pondasi', 'batu kali', 'trapesium', 'rumus', 'qto'],
        isImmutable: true,
      },
      {
        id: 'DOM-02',
        tier: 'DOMAIN',
        title: 'Metodologi Perhitungan Plesteran dan Acian Dinding',
        category: 'QTO_METHODOLOGY',
        content: 'Dinding bata memiliki dua sisi tampak, sehingga luas plesteran dan acian normalnya adalah 2 × Luas Bersih Dinding (dikurangi bukaan pintu dan jendela), kecuali dinding berbatasan langsung dengan tetangga (1 sisi).',
        tags: ['plesteran', 'acian', 'dinding', '2 sisi', 'qto'],
        isImmutable: true,
      },
      {
        id: 'DOM-03',
        tier: 'DOMAIN',
        title: 'Metodologi Galian dan Urugan Kembali',
        category: 'QTO_METHODOLOGY',
        content: 'Galian tanah pondasi memiliki kemiringan lereng (slope) dan ruang kerja kerja (working space), sehingga volume galian selalu lebih besar dari volume pondasi. Volume urugan kembali = Volume Galian - Volume Struktur Pondasi.',
        tags: ['galian', 'urugan kembali', 'tanah', 'slope', 'qto'],
        isImmutable: true,
      },
    ];

    for (const it of domainItems) {
      this.items.set(it.id, it);
    }
  }

  /**
   * Queries knowledge by tier and search tags.
   */
  public queryKnowledge(params: {
    query: string;
    tier?: KnowledgeTier;
    category?: string;
    limit?: number;
  }): KnowledgeItem[] {
    const q = params.query.toLowerCase().trim();
    const limit = params.limit || 5;
    const results: KnowledgeItem[] = [];

    for (const item of this.items.values()) {
      if (params.tier && item.tier !== params.tier) continue;
      if (params.category && item.category !== params.category) continue;

      const matches =
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some(t => t.includes(q) || q.includes(t));

      if (matches) {
        results.push(item);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Injects dynamic project context into Tier 4 (PROJECT).
   */
  public setProjectKnowledge(projectId: string, title: string, content: string, tags: string[] = []): void {
    const id = `PROJ-${projectId}-${Date.now()}`;
    this.items.set(id, {
      id,
      tier: 'PROJECT',
      title,
      category: 'PROJECT_CONTEXT',
      content,
      tags: ['project', projectId, ...tags],
      isImmutable: false,
    });
  }
}

export const knowledgeRepository = KnowledgeRepository.getInstance();
