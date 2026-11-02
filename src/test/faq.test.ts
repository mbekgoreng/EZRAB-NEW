/**
 * Test: FAQ kanonis EZRAB (src/faq/faqData.ts) — integritas konten,
 * pencarian, JSON-LD, dan kontrak aksesibilitas komponen FAQ.
 * Dijalankan via esbuild + vitest shim (pola sama seperti suite lain).
 * Tanpa jaringan; sumber komponen dibaca relatif terhadap cwd repo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  FAQ_FITUR_IDS,
  getFeaturedFaqs,
  getFaqsByIds,
  searchFaqs,
  normalizeFaqText,
  buildFaqPageJsonLd,
} from '../faq/faqData';

const EXPECTED_CATEGORY_COUNTS: Record<string, number> = {
  mengenal: 8,
  rab: 8,
  ai: 10,
  ahsp: 7,
  qto: 6,
  laporan: 4,
  proyek: 4,
  akun: 4,
  keamanan: 6,
};

describe('FAQ content integrity', () => {
  it('has exactly 9 categories in the specified order', () => {
    expect(FAQ_CATEGORIES.map((c) => c.id)).toEqual([
      'mengenal',
      'rab',
      'ai',
      'ahsp',
      'qto',
      'laporan',
      'proyek',
      'akun',
      'keamanan',
    ]);
  });

  it('contains approximately 56 questions (57 incl. 1 justified addition)', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(54);
    expect(FAQ_ITEMS.length).toBeLessThanOrEqual(60);
    expect(FAQ_ITEMS).toHaveLength(57);
  });

  it('matches the per-category distribution', () => {
    for (const [cat, count] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
      expect(FAQ_ITEMS.filter((f) => f.category === cat)).toHaveLength(count);
    }
  });

  it('has unique ids and unique questions', () => {
    expect(new Set(FAQ_ITEMS.map((f) => f.id)).size).toBe(FAQ_ITEMS.length);
    expect(new Set(FAQ_ITEMS.map((f) => normalizeFaqText(f.question))).size).toBe(
      FAQ_ITEMS.length
    );
  });

  it('every item is complete and well-formed', () => {
    const categoryIds = new Set(FAQ_CATEGORIES.map((c) => c.id));
    for (const item of FAQ_ITEMS) {
      expect(categoryIds.has(item.category)).toBe(true);
      expect(item.question.endsWith('?')).toBe(true);
      expect(item.answer.length).toBeGreaterThanOrEqual(100);
      expect(item.keywords.length).toBeGreaterThanOrEqual(2);
      expect(item.lastReviewedAt).toBe('2026-11-02');
    }
  });

  it('contains the required canonical questions', () => {
    const questions = new Set(FAQ_ITEMS.map((f) => f.question));
    const required = [
      'Apa itu EZRAB?',
      'Apa yang membedakan EZRAB dari spreadsheet RAB biasa?',
      'Apakah hasil RAB EZRAB bisa langsung digunakan sebagai dokumen kontrak?',
      'Apakah AI EZRAB dapat mengubah harga AHSP resmi?',
      'Apakah hasil rekomendasi AI langsung diterapkan ke RAB?',
      'Apakah hasil AI selalu benar?',
      'Apakah semua harga di EZRAB merupakan harga resmi pemerintah?',
      'Apakah koefisien AHSP dapat diubah?',
      'Apakah gambar DED hasil scan dapat dianalisis?',
      'Apakah RAB dapat diekspor ke Excel?',
      'Apakah EZRAB sudah dapat digunakan oleh publik?',
      'Apakah data proyek saya aman?',
      'Apakah hasil perhitungan EZRAB dapat dijadikan acuan final?',
    ];
    for (const q of required) expect(questions.has(q)).toBe(true);
  });

  it('contains no unsupported affirmative product claims', () => {
    const banned = [
      'dijamin 100%',
      '100% akurat',
      'tanpa kesalahan sama sekali',
      'telah tersertifikasi',
      'pendaftaran publik telah dibuka',
      'langganan sudah aktif',
      'penagihan sudah berjalan',
      'gratis selamanya tanpa batas',
    ];
    for (const item of FAQ_ITEMS) {
      const text = normalizeFaqText(`${item.question} ${item.answer}`);
      for (const phrase of banned) {
        expect(text.includes(normalizeFaqText(phrase))).toBe(false);
      }
    }
  });

  it('keeps Status A honesty in availability answers', () => {
    const opened = FAQ_ITEMS.find((f) => f.id === 'akun-sudah-dibuka');
    expect(opened?.answer.includes('Belum sepenuhnya')).toBe(true);
    const subs = FAQ_ITEMS.find((f) => f.id === 'akun-berlangganan');
    expect(subs?.answer.includes('belum aktif')).toBe(true);
    const free = FAQ_ITEMS.find((f) => f.id === 'akun-gratis');
    expect(free?.answer.includes('mode simulasi')).toBe(true);
  });

  it('never presents missing prices as zero official prices', () => {
    const missing = FAQ_ITEMS.find((f) => f.id === 'ahsp-harga-belum-tersedia');
    expect(missing?.answer.includes('harga belum tersedia')).toBe(true);
    expect(missing?.answer.includes('nol rupiah')).toBe(true);
    const coef = FAQ_ITEMS.find((f) => f.id === 'ahsp-koefisien-diubah');
    expect(coef?.answer.includes('tidak dapat diubah')).toBe(true);
  });

  it('has exactly 9 featured items for the homepage', () => {
    expect(getFeaturedFaqs()).toHaveLength(9);
  });

  it('resolves every /fitur subset id', () => {
    expect(getFaqsByIds(FAQ_FITUR_IDS)).toHaveLength(FAQ_FITUR_IDS.length);
    expect(FAQ_FITUR_IDS).toHaveLength(10);
  });
});

describe('FAQ search', () => {
  it('matches by question text', () => {
    const ids = searchFaqs('kontrak').map((f) => f.id);
    expect(ids).toContain('rab-dokumen-kontrak');
  });

  it('matches by answer text', () => {
    const ids = searchFaqs('spreadsheet').map((f) => f.id);
    expect(ids).toContain('mengenal-vs-spreadsheet');
  });

  it('matches by keyword', () => {
    const ids = searchFaqs('xlsx').map((f) => f.id);
    expect(ids).toContain('laporan-excel');
  });

  it('is case-insensitive', () => {
    const ids = searchFaqs('OCR').map((f) => f.id);
    expect(ids).toContain('qto-scan');
  });

  it('matches category names', () => {
    const results = searchFaqs('keamanan');
    const ids = results.map((f) => f.id);
    for (const item of FAQ_ITEMS.filter((f) => f.category === 'keamanan')) {
      expect(ids).toContain(item.id);
    }
  });

  it('requires all query tokens to match', () => {
    const ids = searchFaqs('gambar scan').map((f) => f.id);
    expect(ids).toContain('qto-scan');
    expect(ids).not.toContain('rab-apa-itu-rab');
    expect(ids).not.toContain('mengenal-apa-itu-ezrab');
  });

  it('returns everything for an empty query', () => {
    expect(searchFaqs('')).toHaveLength(FAQ_ITEMS.length);
    expect(searchFaqs('   ')).toHaveLength(FAQ_ITEMS.length);
  });

  it('returns an empty list for a nonsense query (empty state)', () => {
    expect(searchFaqs('xyzqwerty123')).toHaveLength(0);
  });

  it('combines category filter with search', () => {
    const inAhsp = searchFaqs('harga', 'ahsp');
    expect(inAhsp.length).toBeGreaterThanOrEqual(3);
    expect(inAhsp.every((f) => f.category === 'ahsp')).toBe(true);
    expect(searchFaqs('harga', 'laporan')).toHaveLength(0);
    expect(searchFaqs('', 'qto')).toHaveLength(6);
  });

  it('normalizes whitespace and punctuation', () => {
    expect(normalizeFaqText('  Apa   itu  RAB? ')).toBe('apa itu rab');
  });
});

describe('FAQ JSON-LD', () => {
  it('builds a FAQPage graph synchronized with the dataset', () => {
    const ld = buildFaqPageJsonLd(FAQ_ITEMS) as {
      '@type': string;
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(FAQ_ITEMS.length);
    expect(new Set(ld.mainEntity.map((e) => e.name)).size).toBe(FAQ_ITEMS.length);
    for (let i = 0; i < FAQ_ITEMS.length; i++) {
      expect(ld.mainEntity[i].name).toBe(FAQ_ITEMS[i].question);
      expect(ld.mainEntity[i].acceptedAnswer.text).toBe(FAQ_ITEMS[i].answer);
    }
  });

  it('only includes the items it is given (no hidden content)', () => {
    const ld = buildFaqPageJsonLd(getFeaturedFaqs()) as { mainEntity: unknown[] };
    expect(ld.mainEntity).toHaveLength(9);
  });
});

describe('FAQ component contracts', () => {
  const accordionSrc = readFileSync(
    join(process.cwd(), 'src/faq/FaqAccordion.tsx'),
    'utf-8'
  );
  const pageSrc = readFileSync(join(process.cwd(), 'src/faq/FaqPage.tsx'), 'utf-8');

  it('accordion uses semantic buttons with aria wiring', () => {
    expect(accordionSrc.includes('aria-expanded')).toBe(true);
    expect(accordionSrc.includes('aria-controls')).toBe(true);
    expect(accordionSrc.includes('aria-labelledby')).toBe(true);
    expect(accordionSrc.includes('role="region"')).toBe(true);
    expect(accordionSrc.includes('type="button"')).toBe(true);
  });

  it('faq page wires SEO meta, canonical, and JSON-LD', () => {
    expect(pageSrc.includes('application/ld+json')).toBe(true);
    expect(pageSrc.includes("'canonical'")).toBe(true);
    expect(pageSrc.includes('FAQ_PAGE_DESCRIPTION')).toBe(true);
    expect(pageSrc.includes('https://ezrab.site/faq')).toBe(true);
  });

  it('faq page implements search, category nav, and empty state', () => {
    expect(pageSrc.includes('role="search"')).toBe(true);
    expect(pageSrc.includes('aria-label="Kategori pertanyaan"')).toBe(true);
    expect(pageSrc.includes('Tidak ada pertanyaan yang cocok')).toBe(true);
    expect(pageSrc.includes('aria-pressed')).toBe(true);
  });
});
