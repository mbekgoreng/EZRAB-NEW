/**
 * measureAccountPromptBudget.ts — PENGUKUR anggaran prompt rakitan
 * (EZRAB Full Account Intelligence, FASE B — 2026-11-20).
 * ============================================================================
 * Mengukur, BUKAN mengasumsikan: panjang prompt rakitan (blok DATA +
 * seksi alat + aturan bahasa) SEBELUM vs SESUDAH seksi AKUN ditambahkan,
 * per skenario, beserta headroom terhadap:
 *   - anggaran internal builder: CANONICAL_TOTAL_PROMPT_BUDGET = 16.000
 *   - batas gateway systemPrompt: 20.000 (prompt v2.5.0 = 18.341 saat
 *     skrip ini ditulis; headroom 1.659 — TIDAK BERUBAH oleh seksi akun
 *     karena seksi akun masuk field `prompt`, bukan `systemPrompt`).
 *
 * Jalankan dari root repo (boleh diulang kapan saja — koordinator
 * menjalankan ulang skrip ini SESUDAH semua pekerjaan Fase B mendarat,
 * termasuk 5 tool baca baru pekerja lain yang ikut menumbuhkan seksi
 * alat via getToolListText()):
 *   npx --yes tsx scripts/measureAccountPromptBudget.ts
 *
 * Skrip ini pengukuran, bukan gerbang: ia selalu exit 0 dan mencetak
 * WARN bila ada skenario yang melewati anggaran (keputusan ada di
 * koordinator). Aserti anggaran yang mengikat hidup di suite
 * src/test/accountContextSections.test.ts.
 */
import {
  assembleChatPrompt,
  buildCanonicalContext,
  CANONICAL_ACCOUNT_BUDGET,
  CANONICAL_TOTAL_PROMPT_BUDGET,
  type CanonicalContextInput,
  type CanonicalMessage,
} from '../src/ai-tools/ezrab-ai/canonicalContext';
import { getToolListText } from '../src/ai-tools/ezrab-ai/tools';
import {
  EZRAB_AI_PROMPT_VERSION,
  EZRAB_AI_SYSTEM_PROMPT,
} from '../src/ai-tools/ezrab-ai/prompt';
import {
  ACCOUNT_UNAVAILABLE_SECTION,
  formatAccountSection,
  type AccountContextSnapshot,
} from '../src/ai-tools/ezrab-ai/accountContext';

const GATEWAY_SYSTEM_PROMPT_CAP = 20_000;

/* ------------------------------------------------------------------ */
/* Fixture snapshot realistis (semua seksi live — kasus terberat)      */
/* ------------------------------------------------------------------ */

function fullSnapshot(): AccountContextSnapshot {
  return {
    generatedAt: '2026-11-20T09:00:00.000Z',
    identity: { freshness: 'live', userId: 'user-11111111-2222-3333-4444-555555555555', email: 'owner@example.id' },
    workspace: { freshness: 'live', workspaceId: 'ws-1', name: 'PT Contoh Konstruksi', role: 'SUPER_ADMIN', status: 'ACTIVE', billingAdmin: true },
    subscription: {
      freshness: 'live',
      subscription: {
        planId: 'professional', status: 'ACTIVE',
        periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z',
        graceEndsAt: null, lastOrderId: 'EZR-SUB-abc123',
      },
      entitlementPlanId: 'professional',
    },
    credits: {
      freshness: 'live',
      balance: {
        accountId: 'acct-1', subscriptionAvailable: 8000, topupAvailable: 350,
        bonusAvailable: 100, freeOnceAvailable: 0, reserved: 0, total: 8450,
      },
      reason: null,
    },
    usage: {
      freshness: 'live',
      recent: [
        { id: 'op-1', feature: 'chat-ai/fast', model: 'Ezrab-flash-v1', credits_charged: 25, status: 'actual', created_at: Date.parse('2026-11-20T08:00:00.000Z') },
        { id: 'op-2', feature: 'ded-ai/medium', model: 'Ezrab-pro', credits_charged: 750, status: 'actual', created_at: Date.parse('2026-11-19T10:00:00.000Z') },
      ],
      count: 2,
    },
    orders: {
      freshness: 'live',
      recent: [
        { orderId: 'EZR-SUB-abc123', kind: 'SUBSCRIPTION', itemId: 'sub-professional', planId: 'professional', amountIdr: 79999, status: 'PAID', createdAt: '2026-11-01T00:00:00.000Z', paidAt: '2026-11-01T00:05:00.000Z' },
      ],
      count: 1,
    },
    invitations: {
      freshness: 'live',
      pending: 2,
      total: 3,
      recent: [
        { email: 'estimator@example.id', role: 'ESTIMATOR', status: 'PENDING', expiresAt: '2026-11-27T00:00:00.000Z', createdAt: '2026-11-20T00:00:00.000Z' },
      ],
    },
  };
}

function degradedSnapshot(): AccountContextSnapshot {
  const s = fullSnapshot();
  return {
    ...s,
    workspace: { freshness: 'live', workspaceId: 'ws-1', name: null, role: 'ESTIMATOR', status: 'ACTIVE', billingAdmin: false },
    subscription: { freshness: 'live', subscription: null, entitlementPlanId: 'free' },
    credits: { freshness: 'live', balance: null, reason: 'NO_BILLING_ACCOUNT' },
    usage: { freshness: 'live', recent: [], count: 0 },
    orders: { freshness: 'live', recent: [], count: 0 },
    invitations: { freshness: 'unavailable', reason: 'NOT_WORKSPACE_ADMIN' },
  };
}

/* ------------------------------------------------------------------ */
/* Skenario                                                            */
/* ------------------------------------------------------------------ */

function msg(role: 'user' | 'assistant', content: string): CanonicalMessage {
  return { role, content };
}

const SHORT_Q = 'Berapa saldo kredit saya saat ini?';
const LONG_USER =
  'Saya mau bangun rumah 2 lantai di lahan 8 m x 15 m, luas bangunan sekitar 180 m2, ' +
  'budget maksimal Rp850.000.000. Tolong buatkan RAB kasar per pekerjaan utama: pondasi, ' +
  'struktur beton, dinding bata, atap, dan finishing. Pakai AHSP 2026 dan harga pasar Jawa Timur.';
const LONG_ASSISTANT =
  'Baik, berikut estimasi kasar berdasarkan AHSP 2026. Pondasi batu kali 12 m3, struktur beton ' +
  'K-225 28 m3, dinding bata 340 m2, atap genteng beton 120 m2, finishing keramik 180 m2. ' +
  'Total estimasi Rp812.450.000 sebelum PPN. Angka ini estimasi awal — perlu DED untuk angka pasti.';

interface Scenario {
  name: string;
  input: Omit<CanonicalContextInput, 'accountSection' | 'reservedChars'>;
}

const scenarios: Scenario[] = [
  {
    name: 'A — minimal (1 pesan singkat, tanpa proyek)',
    input: { messages: [msg('user', SHORT_Q)] },
  },
  {
    name: 'B — tipikal (6 pesan + ringkasan proyek + draft)',
    input: {
      messages: [
        msg('user', 'Saya mau bangun rumah 2 lantai, lahan 8x15 m'),
        msg('assistant', 'Baik, luas bangunan berapa?'),
        msg('user', 'Sekitar 180 m2, budget Rp850 juta'),
        msg('assistant', 'Saya catat: 2 lantai, 180 m2, budget Rp850.000.000.'),
        msg('user', 'Buatkan RAB kasar per pekerjaan utama'),
        msg('assistant', LONG_ASSISTANT),
        msg('user', SHORT_Q),
      ],
      projectSummaryText: 'Rumah tinggal 2 lantai, lahan 8 m x 15 m, luas bangunan 180 m2, lokasi Probolinggo.',
      draftSummary: { title: 'RAB Rumah 2 Lantai', version: 3, partCount: 5, itemCount: 42 },
    },
  },
  {
    name: 'C — kaya (20 pesan + semua seksi: memori, objektif, DED, QTO, ringkasan)',
    input: {
      messages: Array.from({ length: 19 }, (_, i) =>
        i % 2 === 0 ? msg('user', `${LONG_USER} (pesan ${i + 1})`) : msg('assistant', `${LONG_ASSISTANT} (balasan ${i + 1})`),
      ).concat([msg('user', SHORT_Q)]),
      projectSummaryText:
        'Rumah tinggal 2 lantai, lahan 8 m x 15 m, luas bangunan 180 m2, lokasi Probolinggo, ' +
        'pondasi batu kali, struktur beton K-225, atap genteng beton, finishing keramik. '.repeat(4),
      draftSummary: { title: 'RAB Rumah 2 Lantai', version: 3, partCount: 5, itemCount: 42, warnings: ['Harga semen belum terverifikasi'] },
      memorySection: 'Preferensi: bata merah untuk dinding; hindari granit impor. '.repeat(10),
      objectiveSection: 'Tujuan: susun RAB kasar rumah 2 lantai 180 m2 dalam budget Rp850 juta.',
      dedSection: 'DED: denah 2 lantai terdeteksi; 12 ruangan; 3 kamar tidur. '.repeat(8),
      qtoSection: 'QTO: volume beton 28 m3 cocok dengan dimensi pengguna. '.repeat(8),
      storedSummary: {
        text: 'Percakapan membahas RAB rumah 2 lantai 180 m2 budget Rp850 juta; sudah ada estimasi kasar Rp812 juta.',
        messageCount: 9,
        updatedAt: Date.now(),
      } as CanonicalContextInput['storedSummary'],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Pengukuran                                                         */
/* ------------------------------------------------------------------ */

function measure(input: CanonicalContextInput, accountSection: string | null) {
  const reservedChars = assembleChatPrompt('', getToolListText()).length;
  const built = buildCanonicalContext({ ...input, accountSection, reservedChars });
  const prompt = assembleChatPrompt(built.dataBlock, getToolListText());
  return { built, prompt };
}

function pad(n: number, w = 6): string {
  return String(n).padStart(w, ' ');
}

function main(): void {
  const toolList = getToolListText();
  const toolSectionLen = assembleChatPrompt('', toolList).length;
  const accountFull = formatAccountSection(fullSnapshot());
  const accountDegraded = formatAccountSection(degradedSnapshot());

  console.log('=== ANGGARAN PROMPT — FASE B (seksi AKUN) ===');
  console.log(`Prompt sistem: v${EZRAB_AI_PROMPT_VERSION} = ${EZRAB_AI_SYSTEM_PROMPT.length} karakter ` +
    `(batas gateway ${GATEWAY_SYSTEM_PROMPT_CAP}; headroom ${GATEWAY_SYSTEM_PROMPT_CAP - EZRAB_AI_SYSTEM_PROMPT.length} — TIDAK berubah oleh seksi akun)`);
  console.log(`Seksi alat (reservedChars): ${pad(toolSectionLen)} karakter (daftar alat ${toolList.length} karakter)`);
  console.log(`Anggaran total builder: ${CANONICAL_TOTAL_PROMPT_BUDGET} karakter; cap seksi AKUN: ${CANONICAL_ACCOUNT_BUDGET}`);
  console.log(`Seksi AKUN terformat: full ${accountFull.length} karakter; terdegradasi ${accountDegraded.length} karakter; fallback tidak-tersedia ${ACCOUNT_UNAVAILABLE_SECTION.length} karakter`);
  console.log('');

  for (const sc of scenarios) {
    const before = measure(sc.input, null);
    const after = measure(sc.input, accountFull);
    const delta = after.prompt.length - before.prompt.length;
    const headroomAfter = CANONICAL_TOTAL_PROMPT_BUDGET - after.prompt.length;
    console.log(`--- ${sc.name} ---`);
    console.log(`  tanpa akun : prompt ${pad(before.prompt.length)} | dataBlock ${pad(before.built.dataBlock.length)} | headroom ${pad(CANONICAL_TOTAL_PROMPT_BUDGET - before.prompt.length)}`);
    console.log(`  dengan akun: prompt ${pad(after.prompt.length)} | dataBlock ${pad(after.built.dataBlock.length)} | headroom ${pad(headroomAfter)} | delta +${delta}`);
    console.log(`  anggaran sesudah akun: akun=${after.built.report.budget.account} ringkasan=${after.built.report.budget.summary} riwayat=${after.built.report.budget.history} (sebelum: ringkasan=${before.built.report.budget.summary} riwayat=${before.built.report.budget.history})`);
    if (after.prompt.length > CANONICAL_TOTAL_PROMPT_BUDGET) {
      console.log(`  WARN: prompt dengan akun MELEBIHI anggaran ${CANONICAL_TOTAL_PROMPT_BUDGET} (+${after.prompt.length - CANONICAL_TOTAL_PROMPT_BUDGET})`);
    }
    if (before.prompt.length > CANONICAL_TOTAL_PROMPT_BUDGET) {
      console.log('  WARN: prompt TANPA akun sudah melebihi anggaran (baseline bermasalah, bukan regresi Fase B)');
    }
  }
  console.log('');
  console.log('Catatan: delta = panjang seksi akun (496) + label seksi (115). Biaya diserap');
  console.log('anggaran RIWAYAT (riwayat mengecil 611 di tiap skenario) — total tetap ≤ 16.000');
  console.log('selama pesan terakhir wajar (pin S9: pesan terakhir selalu ikut utuh, dan');
  console.log('service.ts fail-closed CONTEXT_BUDGET_EXCEEDED bila total tetap melampaui cap).');
  console.log('Bila 5 tool baca baru menambah reservedChars, riwayat menyerapnya dengan cara');
  console.log('yang sama (skenario C punya ~4.200 karakter riwayat yang bisa mengalah).');
}

main();
