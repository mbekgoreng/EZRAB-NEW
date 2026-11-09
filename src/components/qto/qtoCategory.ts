/**
 * qtoCategory — kategorisasi tampilan item QTO (tab kategori + judul
 * seksi pengelompokan) sebagai fungsi murni.
 *
 * Diekstrak VERBATIM dari QtoRekapVolumeView (pola mobileV3Utils) agar
 * presentasi native mobile (MobileQtoRekap) mengelompokkan item dengan
 * aturan yang SAMA PERSIS dengan view desktop: kategori dari kalkulator
 * registry, sandaran awalan kode QTO bila kalkulator tidak dikenal.
 */
import { getCalculatorById } from '../../engine/constructionCalculators/registry';
import type { QTOItem } from '../../types';

export type QtoDisplayCategory = 'struktur' | 'arsitektur' | 'mep' | 'lainnya';

// Helper to categorize calculator/QTO
export const getQtoCategoryOfItem = (item: QTOItem): QtoDisplayCategory => {
  const calc = item.calculatorId ? getCalculatorById(item.calculatorId) : null;
  if (!calc) {
    if (item.kode?.startsWith('1.') || item.kode?.startsWith('2.') || item.kode?.startsWith('3.') || item.kode?.startsWith('4.')) return 'struktur';
    if (item.kode?.startsWith('5.') || item.kode?.startsWith('6.') || item.kode?.startsWith('7.')) return 'arsitektur';
    return 'lainnya';
  }
  const cat = calc.category as string;
  if (cat === 'persiapan' || cat === 'struktur' || cat === 'pondasi') return 'struktur';
  if (cat === 'arsitektur' || cat === 'finishing' || cat === 'dinding' || cat === 'atap' || cat === 'lantai') return 'arsitektur';
  if (cat === 'mep' || cat === 'me' || cat === 'sanitair') return 'mep';
  return 'lainnya';
};

// Helper for Category Section Heading
export const getQtoSectionHeadingOfItem = (item: QTOItem): string => {
  const calc = item.calculatorId ? getCalculatorById(item.calculatorId) : null;
  if (calc) {
    const cat = calc.category as string;
    if (cat === 'persiapan') return 'Pekerjaan Persiapan';
    if (cat === 'struktur') {
      if (item.kode?.startsWith('2.')) return 'Pekerjaan Tanah';
      if (item.kode?.startsWith('3.')) return 'Pekerjaan Pondasi';
      return 'Pekerjaan Struktur';
    }
    if (cat === 'arsitektur') return 'Pekerjaan Pasangan & Dinding';
    if (cat === 'finishing') return 'Pekerjaan Finishing & Lantai';
    if (cat === 'mep') return 'Pekerjaan Mekanikal & Elektrikal';
  }
  if (item.kode?.startsWith('1.')) return 'Pekerjaan Persiapan';
  if (item.kode?.startsWith('2.')) return 'Pekerjaan Tanah';
  if (item.kode?.startsWith('3.')) return 'Pekerjaan Pondasi';
  if (item.kode?.startsWith('4.')) return 'Pekerjaan Struktur';
  if (item.kode?.startsWith('5.')) return 'Pekerjaan Dinding & Plesteran';
  return 'Pekerjaan Lain-lain';
};
