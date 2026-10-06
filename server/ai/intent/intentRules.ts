import { IntentCategory, ClassifiedIntentResult } from './intentTypes';
import { EntityExtractor } from './entityExtractor';

export interface IntentRule {
  intent: IntentCategory;
  patterns: RegExp[];
  requiresProject: boolean;
  requiresTool: boolean;
  requiresVision: boolean;
  requiresExternalKnowledge: boolean;
  isMutatingAction: boolean;
  suggestedTool?: string;
  confidence: number;
}

export const INTENT_RULES: IntentRule[] = [
  // 1. RAB Total & Summary
  {
    intent: 'RAB_TOTAL',
    patterns: [
      /\b(total\s*rab|rekap\s*rab|ringkasan\s*biaya|total\s*biaya\s*proyek|berapa\s*anggaran|berapa\s*biaya\s*keseluruhan)\b/i,
      /\b(total\s*anggaran|grand\s*total|nilai\s*kontrak\s*rab)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'get_rab_total',
    confidence: 0.99
  },

  // 2. QTO / Volume Calculation
  {
    intent: 'QTO_CALCULATE',
    patterns: [
      /\b(hitung\s*volume|kalkulasi\s*volume|perhitungan\s*qto|takeoff|rumus\s*volume)\b/i,
      /\b(hitung\s*(?:pondasi|sloof|kolom|balok|dinding|plesteran|acian|keramik|atap))\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'calculate_volume',
    confidence: 0.96
  },

  // 3. AHSP Search & Detail
  {
    intent: 'AHSP_SEARCH',
    patterns: [
      /\b(cari\s*ahsp|analisa\s*harga\s*satuan|koefisien\s*pupr|standar\s*pupr|analisa\s*pekerjaan)\b/i,
      /\b(ahsp\s*202(?:6|3|2)|permen\s*pupr|analisis\s*satuan)\b/i
    ],
    requiresProject: false,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'search_ahsp',
    confidence: 0.98
  },

  // 3b. Price Search (Material, Upah, Alat)
  {
    intent: 'PRICE_SEARCH',
    patterns: [
      /\b(berapa\s*harga|harga\s*material|harga\s*upah|harga\s*alat|harga\s*semen|harga\s*pasir|harga\s*bata|daftar\s*harga|cek\s*harga|biaya\s*satuan)\b/i,
      /\bharga\s*(?:material|tenaga|tukang|alat|semen|pasir|bata|besi|cat|kayu|genteng)\b/i
    ],
    requiresProject: false,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'search_material_price',
    confidence: 0.97
  },

  // 4. RAB Item Create (Mutating Action)
  {
    intent: 'RAB_ITEM_CREATE',
    patterns: [
      /\b(tambah(?:kan)?\s*(?:item|pekerjaan|baris|pos)|masukkan\s*(?:item|pekerjaan|baris)|buat\s*item\s*baru|input\s*(?:item|pekerjaan))\b/i,
      /\b(tambah(?:kan)?\s*(?:waterproofing|plesteran|pengecatan|pembesian|pemasangan|keramik|pintu|kusen|cat|baja|sloof|pondasi|kolom|balok|dinding|bata|pagar|urugan|galian|lantai|atap|plafon|sanitasi|pipa|kabel|saklar))\b/i,
      /\b(masukkan|input)\s*(?:waterproofing|plesteran|pengecatan|pembesian|pemasangan|keramik|pintu|kusen|cat|baja|sloof|pondasi|kolom|balok|dinding|bata|pagar|urugan|galian|lantai|atap|plafon|sanitasi|pipa|kabel|saklar)\b/i,
      /\btambah(?:kan)?\s+[\w\s]+\s+\d+(?:[\.,]\d+)?\s*(?:m2|m3|m|kg|ls|bh|titik|unit|m²|m³)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: true,
    suggestedTool: 'create_rab_item',
    confidence: 0.95
  },

  // 5. RAB Item Update (Mutating Action)
  {
    intent: 'RAB_ITEM_UPDATE',
    patterns: [
      /\b(ubah|edit|ganti|update|koreksi)\s*(?:item|pekerjaan|volume|harga|satuan|koefisien)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: true,
    suggestedTool: 'update_rab_item',
    confidence: 0.94
  },

  // 6. RAB Item Delete (Mutating Action - High Risk)
  {
    intent: 'RAB_ITEM_DELETE',
    patterns: [
      /\b(hapus|buang|delete|hilangkan)\s*(?:item|pekerjaan|baris\s*rab|waterproofing|plesteran|keramik|pengecatan|cat|baja|sloof|pondasi|kolom|balok|dinding|bata|pagar|urugan|galian|lantai|atap|plafon|sanitasi|pipa|kabel|saklar)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: true,
    suggestedTool: 'delete_rab_item',
    confidence: 0.98
  },

  // 7. RAB Validate & Audit
  {
    intent: 'RAB_VALIDATE',
    patterns: [
      /\b(audit\s*rab|validasi\s*rab|cek\s*anomali|periksa\s*rab|anomali\s*harga|cek\s*kesalahan)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'validate_rab',
    confidence: 0.97
  },

  // 8. S-Curve & Schedule Query
  {
    intent: 'S_CURVE_QUERY',
    patterns: [
      /\b(kurva\s*s|jadwal\s*proyek|progres\s*fisik|deviasi\s*progres|keterlambatan|monitoring\s*proyek)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'get_kurva_s',
    confidence: 0.97
  },

  // 9. Document / DED / Drawing Analysis (Vision Required)
  {
    intent: 'DED_ANALYSIS',
    patterns: [
      /\b(analisis\s*(?:ded|gambar|drawing|blueprint|denah|potongan)|ekstrak\s*gambar|baca\s*pdf\s*gambar)\b/i
    ],
    requiresProject: true,
    requiresTool: true,
    requiresVision: true,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'analyze_ded_drawing',
    confidence: 0.95
  },

  // 10. General Construction Knowledge
  {
    intent: 'CONSTRUCTION_KNOWLEDGE',
    patterns: [
      /\b(apa\s*fungsi|apa\s*itu|jelaskan\s*(?:fungsi|beda|perbedaan|metode|cara|tahapan))\b/i,
      /\b(?:fungsi|kegunaan|pengertian|definisi)\s*(?:bouwplank|sloof|kolom|balok|pondasi|bekisting|pembesian|acian|plesteran|waterproofing)\b/i
    ],
    requiresProject: false,
    requiresTool: false,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    confidence: 0.96
  },

  // 11. Project Creation & Listing
  {
    intent: 'PROJECT_CREATE',
    patterns: [
      /\b(buat\s*proyek\s*baru|tambah\s*proyek|proyek\s*baru|create\s*project)\b/i
    ],
    requiresProject: false,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: true,
    suggestedTool: 'create_project',
    confidence: 0.98
  },
  {
    intent: 'PROJECT_LIST',
    patterns: [
      /\b(daftar\s*proyek|list\s*proyek|semua\s*proyek|lihat\s*proyek\s*saya)\b/i
    ],
    requiresProject: false,
    requiresTool: true,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    suggestedTool: 'list_projects',
    confidence: 0.97
  },

  // 12. General Greetings & EZRAB Info
  {
    intent: 'GENERAL_CHAT',
    patterns: [
      /^(halo|hai|selamat\s*(?:pagi|siang|sore|malam)|assalamu[']?alaikum|hi|p)\b/i,
      /\b(terima\s*kasih|makasih|thanks|sampai\s*jumpa|bye)\b/i
    ],
    requiresProject: false,
    requiresTool: false,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    confidence: 0.99
  },
  {
    intent: 'EZRAB_ABOUT',
    patterns: [
      /\b(siapa\s*kamu|apa\s*itu\s*ezrab|kemampuan\s*kamu|fitur\s*ezrab|bisa\s*bantu\s*apa)\b/i
    ],
    requiresProject: false,
    requiresTool: false,
    requiresVision: false,
    requiresExternalKnowledge: false,
    isMutatingAction: false,
    confidence: 0.98
  }
];
