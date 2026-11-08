/**
 * constructionTools — orkestrasi tool TERKENDALI untuk jalur Chat AI /
 * Magic AI. Setiap entri registri menyatakan dengan jujur: ADA (wrapper
 * tipis atas layanan deterministik yang benar-benar ada di repo) atau
 * TIDAK TERSEDIA (belum ada layanan yang aman dibungkus — tidak
 * dikarang). Semua tool: skema input tervalidasi sederhana, output
 * terprediksi, tanpa query database arbitrer, tanpa mutasi data
 * finansial resmi.
 */

import { understandProject, type ProjectUnderstanding } from './buildingTypology';
import { searchConstructionKnowledge, type RetrievalHit } from './constructionRetrieval';
import { searchChatAhsp, type ChatSearchResult } from './chatSearch';
import { calculatorRegistry } from '../../engine/calculatorCore/registry/calculatorRegistry';
import {
  buildUniversalDraft,
  draftReadiness,
  displayPriceStatus,
  type BuildResult,
  type DraftReadiness,
  type UniversalDraft,
} from './universalRab';
import { getKnowledgeRecord, CONCEPTUAL_WBS_LABEL } from './constructionKnowledge';

export type ToolAvailability = 'AVAILABLE' | 'NOT_AVAILABLE';

export interface ToolRegistryEntry {
  name: string;
  availability: ToolAvailability;
  /** Alasan bila NOT AVAILABLE (jujur, bukan placeholder diam). */
  unavailableReason?: string;
  inputSchema: string;
  outputSchema: string;
  backing: string;
}

/* ExtractProjectDimensions — wrapper understandProject (buildingTypology). */
export function toolExtractProjectDimensions(input: { text: string }): ProjectUnderstanding {
  if (!input || typeof input.text !== 'string' || !input.text.trim()) {
    throw new Error('ExtractProjectDimensions: input.text wajib string tidak kosong');
  }
  return understandProject(input.text);
}

/* CalculateBuildingArea — aritmetika deterministik dari IR (bukan LLM). */
export function toolCalculateBuildingArea(input: { widthM: number; lengthM: number; floors?: number | null }): {
  footprintM2: number;
  totalFloorAreaM2: number | null;
  floorsBasis: 'explicit' | 'not-multiplied';
} {
  const { widthM, lengthM } = input;
  if (!(widthM > 0) || !(lengthM > 0)) throw new Error('CalculateBuildingArea: widthM/lengthM harus > 0');
  const footprint = Math.round(widthM * lengthM * 100) / 100;
  // Total luas lantai HANYA dihitung bila jumlah lantai eksplisit dari
  // pemanggil — tool ini tidak menebak lantai.
  if (input.floors != null && input.floors > 0) {
    return { footprintM2: footprint, totalFloorAreaM2: Math.round(footprint * input.floors * 100) / 100, floorsBasis: 'explicit' };
  }
  return { footprintM2: footprint, totalFloorAreaM2: null, floorsBasis: 'not-multiplied' };
}

/* SearchConstructionKnowledge — wrapper retrieval lokal deterministik. */
export function toolSearchConstructionKnowledge(input: { query: string; maxResults?: number }): RetrievalHit[] {
  if (!input || typeof input.query !== 'string' || !input.query.trim()) {
    throw new Error('SearchConstructionKnowledge: input.query wajib string tidak kosong');
  }
  return searchConstructionKnowledge(input.query, { maxResults: input.maxResults ?? 5 });
}

/* SearchAHSP — wrapper searchChatAhsp (resolver resmi aplikasi). */
export function toolSearchAhsp(input: { query: string; unit?: string }): ChatSearchResult {
  if (!input || typeof input.query !== 'string' || !input.query.trim()) {
    throw new Error('SearchAHSP: input.query wajib string tidak kosong');
  }
  return searchChatAhsp(input.query, input.unit ? { unit: input.unit } : undefined);
}

/* SearchAvailableCalculators — wrapper calculatorRegistry.list(). */
export function toolSearchAvailableCalculators(input: { keyword?: string }): Array<{ id: string; name: string; category: string; primaryUnit: string }> {
  const all = calculatorRegistry.list().map((c) => ({ id: c.id, name: c.name, category: c.category, primaryUnit: c.primaryUnit }));
  if (!input?.keyword) return all;
  const kw = input.keyword.toLowerCase();
  return all.filter((c) => `${c.id} ${c.name} ${c.category}`.toLowerCase().includes(kw));
}

/* GenerateWorkScope — WBS KONSEPTUAL dari KB (bukan BOQ terverifikasi). */
export function toolGenerateWorkScope(input: { knowledgeId: string }): { label: string; scope: string[] } | null {
  const record = getKnowledgeRecord(input.knowledgeId);
  if (!record) return null;
  return { label: CONCEPTUAL_WBS_LABEL, scope: [...record.conceptualWbs] };
}

/* CreateRabDraft — wrapper buildUniversalDraft (katalog template resmi). */
export function toolCreateRabDraft(input: { text: string }): BuildResult {
  if (!input || typeof input.text !== 'string' || !input.text.trim()) {
    throw new Error('CreateRabDraft: input.text wajib string tidak kosong');
  }
  return buildUniversalDraft(input.text);
}

/* ValidateRabDraft — wrapper draftReadiness (guard transfer yang sama). */
export function toolValidateRabDraft(input: { draft: UniversalDraft }): DraftReadiness {
  if (!input || !input.draft || !Array.isArray(input.draft.parts)) {
    throw new Error('ValidateRabDraft: input.draft tidak valid');
  }
  return draftReadiness(input.draft);
}

/* ValidatePriceProvenance — wrapper displayPriceStatus per item. */
export function toolValidatePriceProvenance(input: { item: Parameters<typeof displayPriceStatus>[0] }): { label: string; detail: string } {
  if (!input || !input.item) throw new Error('ValidatePriceProvenance: input.item wajib ada');
  return displayPriceStatus(input.item);
}

/* ------------------------------------------------------------------ */
/* CalculateQTO — wrapper TERVERIFIKASI atas calculatorCore           */
/* (finalisasi 2026-11-08, §7).                                       */
/*                                                                    */
/* Investigasi: repo MEMILIKI mesin kuantitas deterministik mandiri — */
/* calculatorRegistry (calculatorCore) dengan validateInput()         */
/* (skema parameter + sanitasi) dan calculate() yang mengembalikan    */
/* output ber-provenance (calculatorId, versi, formulaSource). Tool   */
/* ini membungkus KEDUANYA persis seperti jalur aplikasi:             */
/*  1. kalkulator harus ada di registry (selain itu ditolak);         */
/*  2. satuan hasil kalkulator HARUS sama dengan satuan yang diminta  */
/*     pemanggil (selain itu ditolak — tidak ada konversi diam-diam); */
/*  3. input divalidasi skema registry; invalid → error terstruktur;  */
/*  4. output membawa provenance hitungan apa adanya.                 */
/* Batas izin: read-only murni — tidak menulis proyek/RAB apa pun.    */
/* ------------------------------------------------------------------ */

export interface QtoResult {
  calculatorId: string;
  calculatorVersion: string;
  primaryQuantity: number;
  primaryUnit: string;
  breakdown: Record<string, unknown>;
  provenance: string[];
  warnings: string[];
}

export function toolCalculateQto(input: {
  calculatorId: string;
  inputs: Record<string, number | string | boolean | null | undefined>;
  expectedUnit?: string;
  projectId?: string;
}): QtoResult {
  if (!input || typeof input.calculatorId !== 'string' || !input.calculatorId.trim()) {
    throw new Error('CalculateQTO: input.calculatorId wajib string tidak kosong');
  }
  if (!input.inputs || typeof input.inputs !== 'object') {
    throw new Error('CalculateQTO: input.inputs wajib objek parameter kalkulator');
  }
  const def = calculatorRegistry.get(input.calculatorId);
  if (!def) {
    throw new Error(`CalculateQTO: kalkulator "${input.calculatorId}" tidak terdaftar di calculatorCore`);
  }
  // Parameter TAK DIKENAL tidak dibuang diam-diam (audit integrasi
  // jalur produksi P0 §3). Akarnya sudah diperbaiki di ValidationEngine
  // (ERR_UNKNOWN_PARAMETER, FINISH MODE Workstream D), tetapi wrapper
  // tetap menolak DULUAN dengan pesan Bahasa Indonesia yang menyebut
  // parameter asing + daftar parameter sah: jalur registry melempar
  // pesan generik per-kalkulator, sedangkan pemanggil tool ini butuh
  // daftar lengkap dalam satu pesan. Bukan pemeriksaan dobel yang
  // bertentangan — keduanya menolak; wrapper memberi konteks lebih.
  const knownParams = new Set((def.parameters ?? []).map((p) => p.id));
  const unknownParams = Object.keys(input.inputs).filter((k) => !knownParams.has(k));
  if (unknownParams.length > 0) {
    throw new Error(
      `CalculateQTO: parameter tidak dikenal untuk "${def.id}": ${unknownParams.join(', ')} — ` +
      `parameter yang dikenal: ${[...knownParams].join(', ') || '(tidak ada)'}. Parameter asing tidak diabaikan diam-diam.`
    );
  }
  if (input.expectedUnit && def.primaryUnit !== input.expectedUnit) {
    throw new Error(
      `CalculateQTO: satuan tidak kompatibel — kalkulator "${def.id}" menghasilkan "${def.primaryUnit}", pemanggil meminta "${input.expectedUnit}". Konversi lintas satuan tidak dilakukan diam-diam.`
    );
  }
  const validation = calculatorRegistry.validateInput(def.id, input.inputs);
  if (!validation.isValid) {
    const msgs = validation.errors.map((e) => `${e.field ?? ''}: ${e.message}`).join('; ');
    throw new Error(`CalculateQTO: input tidak valid untuk "${def.id}" — ${msgs}`);
  }
  const out = calculatorRegistry.calculate(def.id, input.inputs, {
    projectId: input.projectId ?? 'chat-qto',
    source: { type: 'construction-tool', referenceId: 'CalculateQTO' },
  });
  return {
    calculatorId: out.calculatorId,
    calculatorVersion: out.version,
    primaryQuantity: out.primaryQuantity,
    primaryUnit: out.primaryUnit,
    breakdown: out.breakdown as unknown as Record<string, unknown>,
    provenance: (out.provenance ?? []).map((p) => (typeof p === 'string' ? p : JSON.stringify(p))),
    warnings: (out.warnings ?? []).map((w) => (typeof w === 'string' ? w : w.message)),
  };
}

export const CONSTRUCTION_TOOL_REGISTRY: ToolRegistryEntry[] = [
  { name: 'ExtractProjectDimensions', availability: 'AVAILABLE', inputSchema: '{ text: string }', outputSchema: 'ProjectUnderstanding (IR terstruktur + confidence/ambiguity per field)', backing: 'buildingTypology.understandProject' },
  { name: 'CalculateBuildingArea', availability: 'AVAILABLE', inputSchema: '{ widthM: number, lengthM: number, floors?: number }', outputSchema: '{ footprintM2, totalFloorAreaM2|null, floorsBasis }', backing: 'aritmetika deterministik modul ini' },
  { name: 'SearchConstructionKnowledge', availability: 'AVAILABLE', inputSchema: '{ query: string, maxResults?: number }', outputSchema: 'RetrievalHit[] dengan sitasi provenance', backing: 'constructionRetrieval.searchConstructionKnowledge' },
  { name: 'SearchAHSP', availability: 'AVAILABLE', inputSchema: '{ query: string, unit?: string }', outputSchema: 'ChatSearchResult (resolver AHSP resmi)', backing: 'chatSearch.searchChatAhsp' },
  { name: 'SearchAvailableCalculators', availability: 'AVAILABLE', inputSchema: '{ keyword?: string }', outputSchema: 'Array<{ id, name, category, primaryUnit }>', backing: 'calculatorCore calculatorRegistry.list()' },
  { name: 'GenerateWorkScope', availability: 'AVAILABLE', inputSchema: '{ knowledgeId: string }', outputSchema: '{ label: "conceptual work breakdown, not a verified BOQ", scope: string[] }', backing: 'constructionKnowledge.conceptualWbs' },
  { name: 'CreateRabDraft', availability: 'AVAILABLE', inputSchema: '{ text: string }', outputSchema: 'BuildResult (draft | needs-spec | unsupported)', backing: 'universalRab.buildUniversalDraft' },
  { name: 'ValidateRabDraft', availability: 'AVAILABLE', inputSchema: '{ draft: UniversalDraft }', outputSchema: 'DraftReadiness (READY | NEEDS_SPEC | BLOCKED)', backing: 'universalRab.draftReadiness' },
  { name: 'ValidatePriceProvenance', availability: 'AVAILABLE', inputSchema: '{ item: RabItem }', outputSchema: '{ label, detail } status harga tampil', backing: 'universalRab.displayPriceStatus' },
  { name: 'ResolveUnitPrice', availability: 'AVAILABLE', inputSchema: '{ query: string, unit?: string }', outputSchema: 'ChatSearchResult — resolusi harga satuan lewat resolver yang sama dengan SearchAHSP (satu-satunya jalur harga yang sah)', backing: 'chatSearch.searchChatAhsp (resolver resmi; tidak ada jalur harga kedua)' },
  { name: 'CalculateQTO', availability: 'AVAILABLE', inputSchema: '{ calculatorId: string, inputs: object, expectedUnit?: string, projectId?: string }', outputSchema: 'QtoResult { calculatorId, calculatorVersion, primaryQuantity, primaryUnit, breakdown, provenance[], warnings[] }', backing: 'calculatorCore calculatorRegistry.validateInput + calculate (mesin kuantitas deterministik repo; validasi skema + gerbang kompatibilitas satuan + provenance hitungan)' },
];
