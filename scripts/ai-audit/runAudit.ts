/**
 * EZRAB AUTONOMOUS AI AUDIT — evaluator kualitas percakapan & RAB.
 *
 * Menjalankan dataset regresi (dataset.json) terhadap modul PRODUKSI
 * (bukan tiruan): ekstraktor kebutuhan, registry aksi chat, dan builder
 * RAB spek bebas. Menghasilkan:
 *   - history/<timestamp>.json  — hasil mentah beraudit
 *   - history/index.jsonl       — riwayat perbaikan (append-only)
 *   - latest-report.md          — laporan audit terakhir
 *   - DASHBOARD.md              — dasbor rekayasa internal
 *
 * Prinsip kejujuran: metrik yang tidak bisa diukur dari lingkungan ini
 * (latensi provider, biaya AI live, ketersediaan model) dilaporkan
 * sebagai TIDAK TERSEDIA — tidak pernah dikarang.
 *
 * Jalankan: npx tsx scripts/ai-audit/runAudit.ts
 * Kode keluar: 0 = tidak ada cacat CRITICAL; 2 = ada cacat CRITICAL.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { extractRabNeeds, emptyRabNeeds, missingNeeds, looksLikeNeedsAnswer } from '../../src/ai-tools/ezrab-ai/rabNeeds';
import type { RabNeeds } from '../../src/ai-tools/ezrab-ai/rabNeeds';
import { routeIntent } from '../../src/ai-tools/ezrab-ai/intentRouter';
import * as registry from '../../src/ai-tools/ezrab-ai/actionRegistry';
import { isRabFinalizeText } from '../../src/ai-tools/ezrab-ai/actionRegistry';
import { buildSpecRab } from '../../src/ai-tools/ezrab-ai/specRab';
import { formatDirectRabMessage } from '../../src/ai-tools/ezrab-ai/directRab';
import { classifyChange } from './safetyGate';

const HERE = dirname(fileURLToPath(import.meta.url));
const HISTORY = join(HERE, 'history');
mkdirSync(HISTORY, { recursive: true });

interface CaseExpect {
  kind?: string | null;
  floors?: number | null;
  landArea?: number | null;
  buildingArea?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  carport?: boolean | null;
  lengthM?: number | null;
  finalize?: 'draft' | 'blocked-essential' | 'n/a';
}
interface CaseDef { id: string; title: string; category: string; turns: string[]; expect: CaseExpect }
interface Defect { id: string; severity: 'CRITICAL' | 'MAJOR' | 'MINOR'; caseId: string; rootCause: string; evidence: string }

const dataset = JSON.parse(readFileSync(join(HERE, 'dataset.json'), 'utf8')) as { cases: CaseDef[] };

const ctx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as never;

function landAreaOf(n: RabNeeds): number | null {
  return n.landLength && n.landWidth ? n.landLength * n.landWidth : null;
}

const defects: Defect[] = [];
let fieldsChecked = 0;
let fieldsCorrect = 0;
const caseResults: Array<{ id: string; passed: boolean; notes: string[] }> = [];

function checkField(caseId: string, field: string, actual: unknown, expected: unknown, notes: string[]) {
  fieldsChecked += 1;
  const ok = actual === expected;
  if (ok) fieldsCorrect += 1;
  else notes.push(`kolom ${field}: diharapkan ${JSON.stringify(expected)}, aktual ${JSON.stringify(actual)}`);
  return ok;
}

for (const c of dataset.cases) {
  const notes: string[] = [];
  let passed = true;

  /* --- Lapis 1: ekstraksi murni (fungsi produksi yang sama) --- */
  let acc = emptyRabNeeds();
  for (const turn of c.turns) {
    if (isRabFinalizeText(turn)) continue;
    acc = extractRabNeeds(turn, acc);
  }
  const e = c.expect;
  if (e.kind !== undefined) passed = checkField(c.id, 'kind', acc.kind, e.kind, notes) && passed;
  if (e.floors !== undefined) passed = checkField(c.id, 'floors', acc.floors, e.floors, notes) && passed;
  if (e.landArea !== undefined) passed = checkField(c.id, 'landArea', landAreaOf(acc), e.landArea, notes) && passed;
  if (e.buildingArea !== undefined) passed = checkField(c.id, 'buildingArea', acc.buildingArea, e.buildingArea, notes) && passed;
  if (e.bedrooms !== undefined) passed = checkField(c.id, 'bedrooms', acc.bedrooms, e.bedrooms, notes) && passed;
  if (e.bathrooms !== undefined) passed = checkField(c.id, 'bathrooms', acc.bathrooms, e.bathrooms, notes) && passed;
  if (e.carport !== undefined) passed = checkField(c.id, 'carport', acc.carport, e.carport, notes) && passed;
  if (e.lengthM !== undefined) passed = checkField(c.id, 'lengthM', acc.lengthM, e.lengthM, notes) && passed;

  /* --- Lapis 2: perilaku registry (alur yang benar-benar dialami user) --- */
  const routed = routeIntent(c.turns[0]);
  if (routed.intent === 'CREATE_RAB_SUMMARY') {
    registry.executeIntent('CREATE_RAB_SUMMARY', undefined, { ...(ctx as object), rawText: c.turns[0] } as never);
    for (const turn of c.turns.slice(1)) {
      if (isRabFinalizeText(turn)) {
        if (e.finalize && e.finalize !== 'n/a') {
          const fin = (registry as unknown as { continueRabFinalize?: (t: string) => { ok: boolean; message: string; actions?: Array<{ action: { kind: string } }> } | null }).continueRabFinalize;
          if (typeof fin !== 'function') {
            defects.push({
              id: 'FINALIZE_UNHANDLED', severity: 'CRITICAL', caseId: c.id,
              rootCause: 'Tidak ada handler finalisasi percakapan di actionRegistry — frasa penutup jatuh ke pipeline LLM tanpa state kebutuhan deterministik.',
              evidence: `Kasus ${c.id}: giliran "${turn}" tidak tertangani lokal (routeIntent=${routeIntent(turn).intent}).`,
            });
            passed = false;
            notes.push('finalisasi tidak tertangani lokal');
          } else {
            const res = fin(turn);
            if (!res) { passed = false; notes.push('continueRabFinalize mengembalikan null'); }
            else if (e.finalize === 'draft') {
              const hasPush = (res.actions ?? []).some((a) => a.action.kind === 'push-rab');
              if (!res.ok || !hasPush || !/Total/.test(res.message)) {
                passed = false;
                notes.push('finalisasi tidak menghasilkan draft RAB nyata (ok/push-rab/Total hilang)');
                defects.push({
                  id: 'FINALIZE_NO_DRAFT', severity: 'CRITICAL', caseId: c.id,
                  rootCause: 'Handler finalisasi ada tetapi tidak menghasilkan draft RAB terstruktur yang bisa di-push.',
                  evidence: `Kasus ${c.id}: ok=${res.ok}, push=${hasPush}.`,
                });
              }
            } else if (e.finalize === 'blocked-essential') {
              const hasPush = (res.actions ?? []).some((a) => a.action.kind === 'push-rab');
              if (hasPush || /Total biaya langsung/.test(res.message)) {
                passed = false;
                notes.push('finalisasi mengarang draft padahal data inti belum ada');
                defects.push({
                  id: 'FINALIZE_FABRICATED_DRAFT', severity: 'CRITICAL', caseId: c.id,
                  rootCause: 'Finalisasi menghasilkan draft tanpa basis luas/dimensi — melanggar integritas data.',
                  evidence: `Kasus ${c.id}.`,
                });
              }
            }
          }
        }
        continue;
      }
      if (looksLikeNeedsAnswer(turn)) {
        const res = registry.continueRabNeeds(turn);
        if (/ringkasan kebutuhan yang saya tangkap/.test(res.message)) {
          const already = defects.some((d) => d.id === 'SUMMARY_REPEATED' && d.caseId === c.id);
          if (!already) {
            defects.push({
              id: 'SUMMARY_REPEATED', severity: 'MAJOR', caseId: c.id,
              rootCause: 'continueRabNeeds selalu me-render ulang ringkasan kebutuhan lengkap pada setiap refinement (rabSummaryResult → summarizeRabNeeds tanpa jalur balasan ringkas).',
              evidence: `Kasus ${c.id}, giliran "${turn.slice(0, 40)}…": balasan memuat pembuka ringkasan penuh.`,
            });
          }
          notes.push('balasan refinement mengulang ringkasan penuh');
        }
      }
    }
  }

  caseResults.push({ id: c.id, passed, notes });
}

/* --- Probe integritas di luar kasus --- */
// P1: data opsional (kamar tidur) tidak boleh tercatat sebagai kekurangan inti.
{
  const n = extractRabNeeds('buatkan rab rumah 2 lantai luas 100 m2');
  const missing = missingNeeds(n);
  if (missing.some((m) => /kamar tidur/i.test(m))) {
    defects.push({
      id: 'OPTIONAL_BLOCKS_DRAFT', severity: 'MAJOR', caseId: '(probe)',
      rootCause: 'missingNeeds() memasukkan jumlah kamar tidur sebagai kebutuhan wajib rumah, padahal engine parametrik memiliki default template yang dinyatakan sebagai asumsi.',
      evidence: `missingNeeds(rumah 2 lantai, luas 100) = ${JSON.stringify(missing)}`,
    });
  }
}
// P2: integritas harga builder spek pada TAMPILAN (kontrak yang dialami user):
// item tak berharga (null/0 dari engine) wajib tampil "Harga belum tersedia",
// total wajib berlabel PARSIAL, dan tidak boleh ada sel harga "Rp0".
{
  const built = buildSpecRab('buatkan rab rumah 2 lantai, 6x15, 3 kamar tidur, 2 kamar mandi, ada carport, luas 120m2');
  if (!built) {
    defects.push({
      id: 'SPEC_BUILDER_NULL', severity: 'CRITICAL', caseId: '(probe)',
      rootCause: 'buildSpecRab mengembalikan null untuk spesifikasi rumah 2 lantai yang lengkap.',
      evidence: 'Probe spek skenario wajib.',
    });
  } else {
    const unpriced = built.calc.items.filter((it) => !(typeof it.unitPrice === 'number' && it.unitPrice > 0));
    if (unpriced.length > 0) {
      const msg = formatDirectRabMessage(built);
      if (!msg.includes('Harga belum tersedia') || !msg.includes('PARSIAL') || /\|\s*Rp0\s*\|/.test(msg)) {
        defects.push({
          id: 'PRICE_INTEGRITY', severity: 'CRITICAL', caseId: '(probe)',
          rootCause: 'Formatter menampilkan harga tak terverifikasi sebagai angka nyata atau total tanpa label parsial.',
          evidence: `${unpriced.length} item tak berharga; label jujur hilang dari pesan.`,
        });
      }
      const zeroRep = built.calc.items.filter((it) => it.unitPrice === 0).length;
      if (zeroRep > 0) {
        defects.push({
          id: 'ENGINE_ZERO_PRICE_REPRESENTATION', severity: 'MINOR', caseId: '(probe)',
          rootCause: 'Mesin parametrik merepresentasikan harga belum terpetakan sebagai 0, bukan null. Lapisan tampil menanganinya dengan benar (diperlakukan tak berharga), tetapi representasi ini rapuh untuk konsumen baru. Perbaikan engine = APPROVAL_REQUIRED (mesin harga) — TIDAK diperbaiki otonom.',
          evidence: `${zeroRep} item berharga satuan 0 pada probe skenario wajib.`,
        });
      }
    }
  }
}
// P3: safety gate mengklasifikasi jalur sensitif sebagai wajib persetujuan.
{
  const probe = classifyChange('src/engine/unifiedProjectEngine.ts');
  if (probe.risk !== 'APPROVAL_REQUIRED') {
    defects.push({
      id: 'SAFETY_GATE_BREACH', severity: 'CRITICAL', caseId: '(probe)',
      rootCause: 'Safety gate gagal menandai mesin keuangan sebagai APPROVAL_REQUIRED.',
      evidence: `classifyChange(unifiedProjectEngine) = ${probe.risk}`,
    });
  }
}

/* --- Hasil & artefak --- */
const stamp = new Date();
const iso = stamp.toISOString();
const passedCases = caseResults.filter((r) => r.passed).length;
const result = {
  at: iso,
  casesTotal: caseResults.length,
  casesPassed: passedCases,
  fieldAccuracy: fieldsChecked ? +(100 * fieldsCorrect / fieldsChecked).toFixed(1) : null,
  defects,
  caseResults,
  unavailableMetrics: [
    'Latensi provider AI live — tidak terukur dari lingkungan lokal tanpa memanggil provider berbayar',
    'Biaya AI per tugas live — menunggu metering backend aktif (saat ini simulasi frontend)',
    'Ketersediaan model/provider real-time — tidak dipantau dari repo',
  ],
};
writeFileSync(join(HISTORY, `${iso.replace(/[:.]/g, '-')}.json`), JSON.stringify(result, null, 2));
appendFileSync(join(HISTORY, 'index.jsonl'), JSON.stringify({ at: iso, casesPassed: passedCases, casesTotal: caseResults.length, fieldAccuracy: result.fieldAccuracy, defects: defects.length, critical: defects.filter((d) => d.severity === 'CRITICAL').length }) + '\n');

const defectLines = defects.length
  ? defects.map((d) => `- **[${d.severity}] ${d.id}** (kasus: ${d.caseId}) — ${d.rootCause}\n  Bukti: ${d.evidence}`).join('\n')
  : '- Tidak ada cacat terdeteksi pada dataset saat ini.';
const caseLines = caseResults.map((r) => `- ${r.passed ? '✅' : '❌'} **${r.id}**${r.notes.length ? ` — ${r.notes.join('; ')}` : ''}`).join('\n');

writeFileSync(join(HERE, 'latest-report.md'), `# Laporan Audit AI EZRAB — ${iso}

## Ringkasan
- Kasus regresi: ${passedCases}/${caseResults.length} lulus
- Akurasi ekstraksi kolom: ${result.fieldAccuracy}%
- Cacat: ${defects.length} (CRITICAL: ${defects.filter((d) => d.severity === 'CRITICAL').length})

## Hasil per kasus
${caseLines}

## Cacat & akar masalah
${defectLines}

## Metrik yang TIDAK TERSEDIA (tidak dikarang)
${result.unavailableMetrics.map((m) => `- ${m}`).join('\n')}

## Batas keamanan
Audit ini read-only: tidak mengubah kode, tidak commit/push/deploy, tidak menyentuh data produksi. Perbaikan disiapkan sebagai kandidat patch terisolasi dan melewati safety gate (safetyGate.ts) sebelum diterapkan manusia/agen di sesi terotorisasi.
`);

writeFileSync(join(HERE, 'DASHBOARD.md'), `# Dasbor Rekayasa AI EZRAB (internal)

- Audit terakhir: ${iso}
- Status: ${defects.some((d) => d.severity === 'CRITICAL') ? '🔴 ADA CACAT CRITICAL' : defects.length ? '🟡 Ada cacat non-critical' : '🟢 Bersih pada dataset saat ini'}
- Kasus regresi lulus: ${passedCases}/${caseResults.length}
- Akurasi ekstraksi kolom: ${result.fieldAccuracy}%
- Cacat terbuka: ${defects.length} (CRITICAL ${defects.filter((d) => d.severity === 'CRITICAL').length} · MAJOR ${defects.filter((d) => d.severity === 'MAJOR').length} · MINOR ${defects.filter((d) => d.severity === 'MINOR').length})
- Integritas AHSP/harga pada builder spek: ${defects.some((d) => d.id === 'PRICE_INTEGRITY' || d.id === 'SPEC_BUILDER_NULL') ? '🔴 bermasalah' : '🟢 terverifikasi pada probe'}
- Latensi provider / biaya AI live / ketersediaan model: **TIDAK TERSEDIA** (tidak diukur dari lingkungan ini — tidak dikarang)
- Jadwal: audit berjalan via cron malam Muse (read-only) + workflow CI yang disiapkan di .github/workflows/ai-audit.yml (aktif setelah di-push dengan grant)
- Tindakan butuh persetujuan: setiap perubahan pada data AHSP resmi, mesin keuangan, konversi satuan, billing, pembayaran, auth, skema DB, deployment produksi (safetyGate.ts)
`);

console.log(`Audit ${iso}: kasus ${passedCases}/${caseResults.length}, akurasi kolom ${result.fieldAccuracy}%, cacat ${defects.length} (CRITICAL ${defects.filter((d) => d.severity === 'CRITICAL').length})`);
for (const d of defects) console.log(`  [${d.severity}] ${d.id} — ${d.caseId}`);
process.exit(defects.some((d) => d.severity === 'CRITICAL') ? 2 : 0);
