import { FullAiWorkItem } from '../types';

export interface DuplicateMergeAction {
  keptItemId: string;
  mergedItemId: string;
  reason: string;
}

export interface DeduplicationResult {
  items: FullAiWorkItem[];
  mergeActions: DuplicateMergeAction[];
  duplicatesRemoved: number;
}

export class DuplicateDetector {
  private static instance: DuplicateDetector;

  private constructor() {}

  public static getInstance(): DuplicateDetector {
    if (!DuplicateDetector.instance) {
      DuplicateDetector.instance = new DuplicateDetector();
    }
    return DuplicateDetector.instance;
  }

  private normalizeName(name: string): string {
    if (!name) return '';
    
    let normalized = name.toLowerCase().trim();
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Strip common prefixes
    const prefixes = ['pekerjaan', 'pemasangan', 'pembuatan', 'pasangan', 'instalasi'];
    const words = normalized.split(' ');
    
    while (words.length > 0 && prefixes.includes(words[0])) {
      words.shift();
    }
    
    normalized = words.join(' ');
    
    // Match specific synonyms
    normalized = normalized.replace(/bata merah/g, 'bata');
    normalized = normalized.replace(/dinding bata/g, 'bata');
    
    return normalized.trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = this.normalizeName(str1);
    const s2 = this.normalizeName(str2);
    
    if (s1 === s2) return 1.0;
    
    const words1 = s1.split(' ');
    const words2 = s2.split(' ');
    
    let matches = 0;
    for (const w1 of words1) {
      if (words2.includes(w1)) {
        matches++;
      }
    }
    
    const maxLen = Math.max(words1.length, words2.length);
    if (maxLen === 0) return 0;
    
    return matches / maxLen;
  }

  /**
   * FASE DED-FIX TASK 5: bandingkan dimensi dua item.
   * Dua elemen berbeda boleh punya dimensi sama -> bukan bukti duplikat.
   * Fungsi ini hanya dipakai sebagai syarat TAMBAHAN (bukan satu-satunya).
   * Dimensi objek dibandingkan berdasarkan NILAI (JSON), bukan String()
   * yang mereduksi semua objek menjadi '[object Object]' sehingga dua
   * dimensi objek apa pun selalu "sama".
   */
  private dimensionsEqual(a: any, b: any): boolean {
    const da = a.dimensions || a.quantityFormula || '';
    const db = b.dimensions || b.quantityFormula || '';
    if (!da || !db) return false;
    if (typeof da === 'object' || typeof db === 'object') {
      if (typeof da !== 'object' || typeof db !== 'object') return false;
      try {
        return JSON.stringify(da) === JSON.stringify(db);
      } catch {
        return false;
      }
    }
    return String(da).trim().toLowerCase() === String(db).trim().toLowerCase();
  }

  /**
   * G2 (2026-11-14) — kompatibilitas subset nama: satu nama adalah versi
   * lebih detail dari nama lain (semua kata nama pendek ada di nama
   * panjang), TANPA kata tambahan yang mengandung angka. Ini membedakan
   * dua kasus yang tak terbedakan oleh (similarity, halaman, dimensi):
   *  - 'Keramik 40x40' vs 'Keramik 40x40 Lantai' -> SUBSET (kata
   *    tambahan 'lantai' tanpa angka): frasa berbeda untuk ITEM YANG
   *    SAMA di halaman berbeda — duplikat lintas-halaman yang wajib
   *    digabung (golden TEST 10).
   *  - 'Balok lantai 1' vs 'Balok lantai 2' -> BUKAN subset (token '1'
   *    vs '2' saling bertentangan): item BERBEDA — tidak boleh gabung
   *    (pin TASK 5, dedOldPipelineSafety). Pelajaran yang sama dipakai
   *    untuk kata tambahan: 'lantai 2' sebagai tambahan mengandung angka
   *    lokasi sehingga TIDAK kompatibel-subset.
   */
  private namesSubsetCompatible(str1: string, str2: string): boolean {
    const words1 = this.normalizeName(str1).split(' ').filter(Boolean);
    const words2 = this.normalizeName(str2).split(' ').filter(Boolean);
    if (words1.length === 0 || words2.length === 0) return false;
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const shorter = words1.length <= words2.length ? words1 : words2;
    const longerSet = words1.length <= words2.length ? set2 : set1;
    if (!shorter.every((w) => longerSet.has(w))) return false;
    const shorterSet = words1.length <= words2.length ? set1 : set2;
    const longer = words1.length <= words2.length ? words2 : words1;
    const extra = longer.filter((w) => !shorterSet.has(w));
    if (extra.some((w) => /\d/.test(w))) return false;
    return true;
  }

  public deduplicate(items: FullAiWorkItem[]): DeduplicationResult {
    const result: FullAiWorkItem[] = [];
    const mergeActions: DuplicateMergeAction[] = [];
    let duplicatesRemoved = 0;
    
    if (!items || items.length === 0) {
      return { items: result, mergeActions, duplicatesRemoved };
    }

    const processed = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const currentItem = items[i];
      if (processed.has(currentItem.id)) continue;

      let keptItem = { ...currentItem };
      const duplicatesToMerge: FullAiWorkItem[] = [];

      for (let j = i + 1; j < items.length; j++) {
        const potentialDuplicate = items[j];
        if (processed.has(potentialDuplicate.id)) continue;

        // Check if categories match
        if (keptItem.category !== potentialDuplicate.category) continue;

        // Check similarity
        const similarity = this.calculateSimilarity(keptItem.name, potentialDuplicate.name);
        
        // Check overlapping source pages
        const pages1 = keptItem.sourcePages ? keptItem.sourcePages : [];
        const pages2 = potentialDuplicate.sourcePages ? potentialDuplicate.sourcePages : [];
        const hasOverlappingPage = pages1.some(p => pages2.includes(p));

        // FASE DED-FIX TASK 5: jangan merge hanya karena nama mirip.
        // Syarat merge: similarity tinggi (>= 0.8) ATAU (similarity >= 0.6 DAN
        // halaman sumber tumpang tindih DAN dimensi identik).
        // "Balok lantai 1" vs "Balok lantai 2" (sim ~0.67, halaman beda) -> TIDAK merge.
        // G2: ATAU (similarity >= 0.6 DAN nama kompatibel-subset DAN dimensi
        // identik) — duplikat lintas-halaman: item yang sama muncul di
        // halaman BERBEDA sehingga syarat "halaman tumpang tindih" tidak
        // pernah terpenuhi untuknya; kompatibilitas subset (bukan sekadar
        // similarity) yang menjaga varian lantai tetap tidak bergabung.
        const dimsMatch = this.dimensionsEqual(keptItem, potentialDuplicate);
        const subsetCompatible = this.namesSubsetCompatible(keptItem.name, potentialDuplicate.name);
        if (similarity >= 0.8 || (similarity >= 0.6 && hasOverlappingPage && dimsMatch) || (similarity >= 0.6 && subsetCompatible && dimsMatch)) {
          duplicatesToMerge.push(potentialDuplicate);
          processed.add(potentialDuplicate.id);
        }
      }

      for (const dup of duplicatesToMerge) {
        const keptEvidenceCount = keptItem.sourceEvidence ? keptItem.sourceEvidence.length : 0;
        const dupEvidenceCount = dup.sourceEvidence ? dup.sourceEvidence.length : 0;
        
        if (dupEvidenceCount > keptEvidenceCount) {
          mergeActions.push({
            keptItemId: dup.id,
            mergedItemId: keptItem.id,
            reason: `Duplicate detected. Kept ${dup.name} over ${keptItem.name} due to more evidence.`
          });
          
          keptItem.id = dup.id;
          keptItem.name = dup.name;
        } else {
          mergeActions.push({
            keptItemId: keptItem.id,
            mergedItemId: dup.id,
            reason: `Duplicate detected. Kept ${keptItem.name} over ${dup.name} due to more/equal evidence.`
          });
        }

        // Combine source pages
        if (dup.sourcePages) {
          keptItem.sourcePages = Array.from(new Set([...(keptItem.sourcePages ? keptItem.sourcePages : []), ...dup.sourcePages]));
        }
        
        // Combine evidence
        if (dup.sourceEvidence) {
          keptItem.sourceEvidence = [...(keptItem.sourceEvidence ? keptItem.sourceEvidence : []), ...dup.sourceEvidence];
        }
        
        duplicatesRemoved++;
      }

      processed.add(currentItem.id);
      result.push(keptItem);
    }

    return {
      items: result,
      mergeActions,
      duplicatesRemoved
    };
  }
}

export const duplicateDetector = DuplicateDetector.getInstance();
