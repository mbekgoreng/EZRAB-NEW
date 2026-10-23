/**
 * DOCUMENT STUDIO — Context Adapter (src/ai-tools/document-ai/contextAdapter.ts)
 *
 * Mengambil HANYA field yang benar-benar ada pada objek proyek EZRAB dan
 * profil perusahaan, lengkap dengan provenance (master prompt §E).
 *
 * Aturan keras:
 * - Field yang tidak ada pada tipe sumber TIDAK dikarang dan TIDAK dimasukkan.
 * - Nilai kosong tetap dikembalikan dengan verificationStatus 'missing' —
 *   itu sinyal missing-field detection, bukan celah untuk nilai demo/fallback.
 * - Fungsi murni: tidak membaca storage, tidak memanggil AI.
 */

import type { Project } from '../../types';
import type { CompanyProfile } from './companyProfile';
import type { DocTemplateMeta } from './docTemplates';
import { missingRequiredFields } from './docTemplates';
import type { ContextField, MissingFieldInfo } from './types';

export interface CollectContextOptions {
  /** Template terpilih — dipakai untuk konteks keputusan, bukan untuk mengarang field. */
  templateMeta?: DocTemplateMeta;
  /** Sumber yang diizinkan pengguna. Yang false tidak diambil sama sekali. */
  sources: { project: boolean; company: boolean };
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function makeField(
  fieldName: string,
  raw: unknown,
  sourceType: ContextField['sourceType'],
  sourceId: string | undefined,
  retrievedAt: string,
): ContextField {
  const value = str(raw);
  return {
    fieldName,
    value,
    sourceType,
    sourceId,
    retrievedAt,
    verificationStatus: value ? 'verified' : 'missing',
  };
}

/**
 * Kumpulkan konteks proyek + perusahaan menjadi ContextField[] ber-provenance.
 * `project`/`companyProfile` boleh null (belum dipilih/belum diisi) — hasilnya
 * daftar kosong untuk sumber itu, bukan nilai pengganti.
 */
export function collectProjectContext(
  project: Project | null | undefined,
  companyProfile: CompanyProfile | null | undefined,
  opts: CollectContextOptions,
): ContextField[] {
  const retrievedAt = new Date().toISOString();
  const out: ContextField[] = [];

  if (opts.sources.project && project) {
    const sid = project.id || undefined;
    const add = (name: string, raw: unknown, st: ContextField['sourceType'] = 'project') =>
      out.push(makeField(name, raw, st, sid, retrievedAt));

    add('namaProyek', project.name);
    add('nomorProyek', project.projectNumber);
    add('namaKlien', project.clientName ?? project.client);
    add('lokasiProyek', project.location);
    add('provinsi', project.province);
    add('kabupatenKota', project.cityRegency);
    add('institusi', project.institution);
    add('jenisKontrak', project.contractType);
    add('sumberDana', project.fundingSource);
    add('namaPemilik', project.ownerName);
    add('konsultanPengawas', project.consultantName);
    add('kontraktorPelaksana', project.contractorName);
    add('tahunAnggaran', project.budgetYear);
    add('tanggalMulai', project.startDate, 'schedule');
    add('tanggalTargetSelesai', project.targetDate, 'schedule');
    // Nilai RAB total hanya dari ringkasan biaya tersimpan; 0/belum ada = missing.
    const grand = project.costSummary?.grandTotal;
    const rabTotal = typeof grand === 'number' && grand > 0 ? grand : project.totalRab;
    out.push({
      fieldName: 'totalNilaiRab',
      value: typeof rabTotal === 'number' && rabTotal > 0 ? String(rabTotal) : '',
      sourceType: 'rab',
      sourceId: sid,
      retrievedAt,
      verificationStatus: typeof rabTotal === 'number' && rabTotal > 0 ? 'verified' : 'missing',
    });
  }

  if (opts.sources.company && companyProfile) {
    const sid = companyProfile.id || 'company-profile';
    const add = (name: string, raw: unknown) =>
      out.push(makeField(name, raw, 'company', sid, retrievedAt));
    add('namaPerusahaan', companyProfile.name);
    add('alamatPerusahaan', companyProfile.address);
    add('teleponPerusahaan', companyProfile.phone);
    add('emailPerusahaan', companyProfile.email);
    add('websitePerusahaan', companyProfile.website);
    add('infoPerusahaan', companyProfile.extra);
  }

  return out;
}

const CRITICAL_CONTEXT: Array<{ fieldName: string; label: string; reason: string }> = [
  { fieldName: 'namaProyek', label: 'Nama Proyek', reason: 'Nama proyek belum terisi pada data proyek terpilih.' },
  { fieldName: 'namaPerusahaan', label: 'Nama Perusahaan', reason: 'Nama perusahaan belum terisi pada profil perusahaan — dokumen berkop surat membutuhkannya.' },
];

/**
 * Deteksi field yang belum tersedia:
 * 1. Field wajib template yang belum diisi pengguna (bila fieldValues diberikan).
 * 2. Field konteks kritis (nama proyek; nama perusahaan untuk dokumen berkop)
 *    yang berstatus 'missing' pada konteks terpilih.
 * Tidak ada nilai yang ditebak — yang tidak diketahui dinyatakan belum tersedia.
 */
export function detectMissingFields(
  contextFields: ContextField[],
  templateMeta?: DocTemplateMeta,
  fieldValues?: Record<string, string>,
): MissingFieldInfo[] {
  const out: MissingFieldInfo[] = [];
  const seen = new Set<string>();

  if (templateMeta && fieldValues) {
    const missingLabels = missingRequiredFields(templateMeta, fieldValues);
    for (const label of missingLabels) {
      const def = templateMeta.fields.find((f) => f.label === label);
      const key = def?.key ?? label;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label, reason: `Field wajib template "${label}" belum diisi.` });
    }
  }

  for (const crit of CRITICAL_CONTEXT) {
    const f = contextFields.find((c) => c.fieldName === crit.fieldName);
    // Hanya laporkan bila sumbernya memang dipilih (field ada di daftar) tapi kosong.
    if (f && f.verificationStatus === 'missing' && !seen.has(crit.fieldName)) {
      seen.add(crit.fieldName);
      out.push({ key: crit.fieldName, label: crit.label, reason: crit.reason });
    }
  }

  return out;
}

/** Blok konteks untuk prompt — HANYA field terverifikasi (ada nilainya), dengan label sumber. */
export function formatContextBlock(fields: ContextField[]): string {
  const usable = fields.filter((f) => f.verificationStatus !== 'missing' && f.value.trim());
  if (!usable.length) return '';
  const label: Record<ContextField['sourceType'], string> = {
    project: 'data proyek',
    company: 'profil perusahaan',
    rab: 'rekap RAB tersimpan',
    schedule: 'jadwal proyek',
    document: 'dokumen sumber',
    user: 'masukan pengguna',
  };
  const lines = usable.map((f) => `- ${f.fieldName}: ${f.value} (sumber: ${label[f.sourceType]})`);
  return `KONTEKS TERVERIFIKASI (gunakan persis, jangan diubah/dikarang):\n${lines.join('\n')}`;
}
