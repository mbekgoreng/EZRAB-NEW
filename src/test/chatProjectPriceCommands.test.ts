/**
 * EZRAB Chat AI — SET_PROJECT_PRICE + SET_PROJECT_PRICE_CONFIRM
 * (Workstream B1, 2026-11-19, gap P6 audit perintah Ezrab AI).
 *
 * "ubah harga <material> jadi RpY untuk proyek ini" → resolusi
 * nama→kode atas database harga master → PRATINJAU (langkah 1, tidak
 * pernah menulis) → konfirmasi tombol (langkah 2, callback view →
 * updateProjectPriceOverride). Override SATU PROYEK — harga master
 * database TIDAK berubah.
 *
 * Fail-closed: material tak ditemukan / ambigu / record berkode kosong
 * (resourceCode "") → tidak ada override, pesan jujur. TIDAK PERNAH
 * mengarang harga: harga master pembanding berasal dari record master
 * (1 harga unik → harga itu; bervariasi → harga resolver per kode+satuan
 * BILA cocok dengan salah satu harga mentah, bila tidak → harga record
 * pertama kelompok, dengan rentang diungkapkan di pratinjau).
 *
 * Fixture data (terverifikasi probe 2026-11-19 atas
 * priceMaster.generated.ts + resolver):
 * - "Paku asbes": 1 record, kode "", Rp34.500/kg → empty-code.
 * - "Semen": kode M12, kg, harga 1.300–16.100 (10 sumber); resolver
 *   M12/kg = 1.600 (cocok dengan harga mentah) → masterPrice 1.600.
 * - "Motor Grader": kode E13, jam, 360.000/480.000/500.000; resolver
 *   597.583,41 TIDAK cocok harga mentah mana pun → record pertama
 *   360.000, rentang diungkapkan.
 * - "Tukang batu": kode L.02, OH, 160.000/175.000; resolver 145.000
 *   tidak cocok → record pertama 160.000.
 * - "Besi Beton" (kode M57a): kg, 12.500–19.600; resolver 9.831 tidak
 *   cocok → record pertama 12.500.
 * - "cat": 3 kelompok (Cat Marka Thermoplastic / Cat Besi /
 *   Cat anti karat) → ambiguous. "paku" = nama persis "Paku" (M18) →
 *   OK (preferensi nama persis).
 *
 * Run: npx vitest run src/test/chatProjectPriceCommands.test.ts
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  executeIntent,
  resolveProjectPriceTarget,
  stripProjectScopePhrase,
  type ChatActionContext,
  type ProjectPriceOverrideInput,
} from '../ai-tools/ezrab-ai/actionRegistry';

const PROJECT = { id: 'proj-1', name: 'Proyek Satu' };

const baseCtx = (over: Partial<ChatActionContext> = {}): ChatActionContext => ({
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: PROJECT,
  projects: [PROJECT],
  projectTotal: null,
  ...over,
});

/** Param langkah 1 = ekor sesudah "harga" (seperti router mengekstraknya). */
const step1 = (param: string, ctx: ChatActionContext = baseCtx()) =>
  executeIntent('SET_PROJECT_PRICE', param, ctx);

describe('SET_PROJECT_PRICE: routing', () => {
  it('B6-1. "ubah harga paku asbes untuk proyek ini" → SET_PROJECT_PRICE', () => {
    const r = routeIntent('ubah harga paku asbes untuk proyek ini');
    expect(r.intent).toBe('SET_PROJECT_PRICE');
    expect(r.param).toBe('paku asbes untuk proyek ini');
  });

  it('B6-2. dengan nilai → SET_PROJECT_PRICE + param nama+nilai', () => {
    const r = routeIntent('ubah harga semen jadi Rp 2.000 untuk proyek ini');
    expect(r.intent).toBe('SET_PROJECT_PRICE');
    expect(r.param).toBe('semen jadi Rp 2.000 untuk proyek ini');
  });

  it('B6-3. "tolong ubah harga semen jadi 2000 untuk proyek ini" → SET_PROJECT_PRICE (bukan HELP)', () => {
    expect(routeIntent('tolong ubah harga semen jadi 2000 untuk proyek ini').intent).toBe('SET_PROJECT_PRICE');
  });

  it('B6-4. frasa "di proyek ini" / "khusus proyek ini" juga dikenali', () => {
    expect(routeIntent('ubah harga semen jadi 2000 di proyek ini').intent).toBe('SET_PROJECT_PRICE');
    expect(routeIntent('ganti harga semen jadi 2000 khusus proyek ini').intent).toBe('SET_PROJECT_PRICE');
  });

  it('B6-5. tidak membajak UPDATE_ITEM_PRICE: tanpa "proyek ini" → UPDATE_ITEM_PRICE', () => {
    expect(routeIntent('ubah harga plesteran jadi 50000').intent).toBe('UPDATE_ITEM_PRICE');
    expect(routeIntent('ubah harga paku asbes').intent).toBe('UPDATE_ITEM_PRICE');
  });

  it('B6-6. tidak membajak UPDATE_ITEM_PRICE: "harga item … untuk proyek ini" → UPDATE_ITEM_PRICE', () => {
    expect(routeIntent('ubah harga item plesteran jadi 50000 untuk proyek ini').intent).toBe('UPDATE_ITEM_PRICE');
  });

  it('B6-7. penjaga settings: "ubah harga overhead … untuk proyek ini" TIDAK menjadi SET_PROJECT_PRICE — preseden lama berlaku (rute item menang atas pengaturan untuk frasa "harga overhead", komentar intentRouter)', () => {
    expect(routeIntent('ubah harga overhead jadi 10% untuk proyek ini').intent).toBe('UPDATE_ITEM_PRICE');
  });

  it('B6-8. stripProjectScopePhrase membuang frasa cakupan di posisi mana pun', () => {
    expect(stripProjectScopePhrase('semen jadi Rp 2.000 untuk proyek ini')).toBe('semen jadi Rp 2.000');
    expect(stripProjectScopePhrase('semen untuk proyek ini jadi Rp 2.000')).toBe('semen jadi Rp 2.000');
    expect(stripProjectScopePhrase('semen jadi Rp 2.000 di proyek ini')).toBe('semen jadi Rp 2.000');
  });
});

describe('SET_PROJECT_PRICE: resolusi nama→kode', () => {
  it('B6-9. "paku asbes" → empty-code (record ada, Rp34.500/kg, kode "")', () => {
    const res = resolveProjectPriceTarget('paku asbes');
    expect(res.status).toBe('empty-code');
    if (res.status === 'empty-code') {
      expect(res.name).toBe('Paku asbes');
      expect(res.unit).toBe('kg');
      expect(res.priceText).toContain('34.500');
    }
  });

  it('B6-10. "semen" → ok, kode M12, kg, masterPrice 1.600 (resolver, cocok harga mentah), rentang 1.300–16.100', () => {
    const res = resolveProjectPriceTarget('semen');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.target.resourceCode).toBe('M12');
      expect(res.target.resourceName).toBe('Semen');
      expect(res.target.category).toBe('MATERIAL');
      expect(res.target.unit).toBe('kg');
      expect(res.target.masterPrice).toBe(1600);
      expect(res.target.priceRange).toEqual({ min: 1300, max: 16100, sources: 10 });
    }
  });

  it('B6-11. "motor grader" → ok, kode E13, jam, masterPrice 360.000 (resolver 597.583 tidak cocok → record pertama)', () => {
    const res = resolveProjectPriceTarget('motor grader');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.target.resourceCode).toBe('E13');
      expect(res.target.category).toBe('EQUIPMENT');
      expect(res.target.unit).toBe('jam');
      expect(res.target.masterPrice).toBe(360000);
      expect(res.target.priceRange).toEqual({ min: 360000, max: 500000, sources: 3 });
    }
  });

  it('B6-12. "tukang batu" → ok, kode L.02, OH, masterPrice 160.000 (resolver 145.000 tidak cocok → record pertama)', () => {
    const res = resolveProjectPriceTarget('tukang batu');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.target.resourceCode).toBe('L.02');
      expect(res.target.category).toBe('LABOR');
      expect(res.target.unit).toBe('OH');
      expect(res.target.masterPrice).toBe(160000);
      expect(res.target.priceRange).toEqual({ min: 160000, max: 175000, sources: 2 });
    }
  });

  it('B6-13. kode eksak "M57a" → ok, Besi Beton, kg, masterPrice 12.500 (record pertama)', () => {
    const res = resolveProjectPriceTarget('M57a');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.target.resourceCode).toBe('M57a');
      expect(res.target.resourceName).toBe('Besi Beton');
      expect(res.target.unit).toBe('kg');
      expect(res.target.masterPrice).toBe(12500);
    }
  });

  it('B6-14. "cat" → ambiguous (3 kelompok, tanpa nama persis)', () => {
    const res = resolveProjectPriceTarget('cat');
    expect(res.status).toBe('ambiguous');
    if (res.status === 'ambiguous') {
      expect(res.candidates.length).toBe(3);
      expect(res.candidates.map((c) => c.name).sort()).toEqual(
        ['Cat Besi', 'Cat Marka Thermoplastic', 'Cat anti karat M.129.a'].sort(),
      );
    }
  });

  it('B6-15. "paku" = nama persis "Paku" → ok (preferensi nama persis, bukan ambiguous)', () => {
    const res = resolveProjectPriceTarget('paku');
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.target.resourceCode).toBe('M18');
      expect(res.target.resourceName).toBe('Paku');
      expect(res.target.unit).toBe('kg');
    }
  });

  it('B6-16. nama khayalan → not-found', () => {
    const res = resolveProjectPriceTarget('barang khayalan zzzqqq');
    expect(res.status).toBe('not-found');
  });
});

describe('SET_PROJECT_PRICE: langkah 1 (pratinjau, tidak menulis)', () => {
  it('B6-17. tanpa proyek aktif → minta buka proyek dulu', () => {
    const res = step1('semen jadi Rp 2.000 untuk proyek ini', baseCtx({ activeProject: null }));
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Tidak ada proyek aktif');
  });

  it('B6-18. tanpa harga → tanya balik dengan contoh (tidak menebak)', () => {
    const res = step1('semen untuk proyek ini');
    expect(res.ok).toBe(true);
    expect(res.message).toContain('jadi berapa');
    expect(res.message).toContain('semen');
  });

  it('B6-19. harga tak terbaca → ok:false', () => {
    const res = step1('semen jadi segitu untuk proyek ini');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('tidak bisa dibaca sebagai nominal Rupiah');
  });

  it('B6-20. harga Rp0 → ok:false (Rp0 bukan harga valid)', () => {
    const res = step1('semen jadi Rp 0 untuk proyek ini');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('lebih dari Rp0');
  });

  it('B6-21. paku asbes → ok:false, alasan kode kosong + alternatif ubah harga item; callback TIDAK dipanggil', () => {
    let calls = 0;
    const res = step1('paku asbes jadi Rp 40.000 untuk proyek ini', baseCtx({
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('TIDAK PUNYA KODE');
    expect(res.message).toContain('34.500');
    expect(res.message).toContain('ubah harga item Paku asbes');
  });

  it('B6-22. material tak ditemukan → ok:false + saran "cari harga" + jalur item', () => {
    const res = step1('barang khayalan zzzqqq jadi Rp 1.000 untuk proyek ini');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('tidak ditemukan di database harga master');
    expect(res.message).toContain('cari harga barang khayalan zzzqqq');
  });

  it('B6-23. ambigu ("cat") → ok:false + daftar kandidat', () => {
    const res = step1('cat jadi Rp 50.000 untuk proyek ini');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('beberapa material');
    expect(res.message).toContain('Cat Besi');
    expect(res.message).toContain('Cat Marka Thermoplastic');
  });

  it('B6-24. satuan disebut tapi tak cocok → ok:false (tidak dikonversi)', () => {
    const res = step1('semen jadi Rp 2.000 per m2 untuk proyek ini');
    expect(res.ok).toBe(false);
    expect(res.message).toContain('tidak cocok dengan satuan Semen');
    expect(res.message).toContain('kg');
  });

  it('B6-25. semen → pratinjau lengkap + tombol konfirmasi (payload JSON) + Batal; callback TIDAK dipanggil', () => {
    let calls = 0;
    const res = step1('semen jadi Rp 2.000 untuk proyek ini', baseCtx({
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Semen (kode M12)');
    expect(res.message).toContain('Rp 2.000/kg');
    expect(res.message).toContain('Rp 1.300');
    expect(res.message).toContain('Rp 16.100');
    expect(res.message).toContain('HANYA berlaku untuk proyek "Proyek Satu"');
    expect(res.message).toContain('harga master database TIDAK berubah');
    expect(res.actions).toHaveLength(2);
    const confirm = res.actions![0];
    expect(confirm.label).toBe('Ya, terapkan override');
    expect(confirm.action.kind).toBe('intent');
    if (confirm.action.kind === 'intent') {
      expect(confirm.action.intent).toBe('SET_PROJECT_PRICE_CONFIRM');
      const payload = JSON.parse(confirm.action.param ?? '');
      expect(payload).toEqual({
        v: 1, projectId: 'proj-1', code: 'M12', name: 'Semen',
        category: 'MATERIAL', unit: 'kg', masterPrice: 1600, projectPrice: 2000,
      });
    }
    const cancel = res.actions![1];
    expect(cancel.label).toBe('Batal');
    expect(cancel.action).toEqual({ kind: 'navigate', menu: 'harga-proyek' });
  });

  it('B6-26. satuan disebut dan cocok ("per kg") → pratinjau jalan', () => {
    const res = step1('semen jadi Rp 2.000 per kg untuk proyek ini');
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Semen (kode M12)');
  });

  it('B6-27. "1,5 ribu" / "2,5 juta" diparse sebagai Rupiah', () => {
    const res = step1('semen jadi 1,5 ribu untuk proyek ini');
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Rp 1.500/kg');
  });
});

describe('SET_PROJECT_PRICE_CONFIRM: langkah 2 (menulis lewat callback)', () => {
  const payload = JSON.stringify({
    v: 1, projectId: 'proj-1', code: 'M12', name: 'Semen',
    category: 'MATERIAL', unit: 'kg', masterPrice: 1600, projectPrice: 2000,
  });

  it('B6-28. payload valid + proyek cocok → callback dipanggil sekali dengan input persis + pesan sukses menyebut scope', () => {
    const seen: Array<{ projectId: string; input: ProjectPriceOverrideInput }> = [];
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', payload, baseCtx({
      setProjectPriceOverride: (projectId, input) => { seen.push({ projectId, input }); return true; },
    }));
    expect(res.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].projectId).toBe('proj-1');
    expect(seen[0].input).toEqual({
      resourceCode: 'M12', resourceName: 'Semen', category: 'MATERIAL',
      unit: 'kg', masterPrice: 1600, projectPrice: 2000,
    });
    expect(res.message).toContain('kini Rp 2.000/kg');
    expect(res.message).toContain('Hanya proyek ini yang berubah');
    expect(res.message).toContain('harga master database tidak berubah');
  });

  it('B6-29. proyek aktif berganti sejak pratinjau → ditolak, callback TIDAK dipanggil', () => {
    let calls = 0;
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', payload, baseCtx({
      activeProject: { id: 'proj-2', name: 'Proyek Dua' },
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Proyek aktif sudah berganti');
  });

  it('B6-30. payload rusak (bukan JSON) → ok:false, callback TIDAK dipanggil', () => {
    let calls = 0;
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', 'bukan json', baseCtx({
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('sudah tidak valid');
  });

  it('B6-31. payload berkode kosong → ok:false (pertahanan berlapis)', () => {
    let calls = 0;
    const bad = JSON.stringify({ v: 1, projectId: 'proj-1', code: '', name: 'X', category: 'MATERIAL', unit: 'kg', masterPrice: 1, projectPrice: 2 });
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', bad, baseCtx({
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
  });

  it('B6-32. payload harga Rp0/negatif → ok:false', () => {
    let calls = 0;
    const bad = JSON.stringify({ v: 1, projectId: 'proj-1', code: 'M12', name: 'Semen', category: 'MATERIAL', unit: 'kg', masterPrice: 1600, projectPrice: 0 });
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', bad, baseCtx({
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
  });

  it('B6-33. tanpa callback → ok:false, jujur "belum bisa"', () => {
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', payload, baseCtx());
    expect(res.ok).toBe(false);
    expect(res.message).toContain('belum bisa menerapkan override');
  });

  it('B6-34. callback mengembalikan false → ok:false, tanpa klaim sukses', () => {
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', payload, baseCtx({
      setProjectPriceOverride: () => false,
    }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('belum diterapkan');
  });

  it('B6-35. tanpa proyek aktif → tidak diterapkan', () => {
    let calls = 0;
    const res = executeIntent('SET_PROJECT_PRICE_CONFIRM', payload, baseCtx({
      activeProject: null,
      setProjectPriceOverride: () => { calls++; return true; },
    }));
    expect(calls).toBe(0);
    expect(res.message).toContain('Tidak ada proyek aktif');
  });

  it('B6-36. end-to-end: pratinjau → param tombol → konfirmasi menerapkan', () => {
    const seen: ProjectPriceOverrideInput[] = [];
    const ctx = baseCtx({
      setProjectPriceOverride: (_id, input) => { seen.push(input); return true; },
    });
    const preview = step1('tukang batu jadi Rp 150.000 untuk proyek ini', ctx);
    expect(preview.ok).toBe(true);
    const btn = preview.actions![0];
    expect(btn.action.kind).toBe('intent');
    const param = btn.action.kind === 'intent' ? btn.action.param : undefined;
    const done = executeIntent('SET_PROJECT_PRICE_CONFIRM', param, ctx);
    expect(done.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      resourceCode: 'L.02', resourceName: 'Tukang batu', category: 'LABOR',
      unit: 'OH', masterPrice: 160000, projectPrice: 150000,
    });
  });
});
