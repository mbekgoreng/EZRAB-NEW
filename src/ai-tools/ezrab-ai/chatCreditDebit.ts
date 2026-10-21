/**
 * CHAT AI — CREDIT DEBIT GATE (Fase 1 Recovery, P1-2)
 *
 * Satu-satunya gerbang pemotongan kredit simulasi untuk jalur online Chat AI.
 *
 * Bug lama: view.tsx memanggil consume() tepat sesudah `await send()` TANPA
 * memeriksa hasil — setiap kegagalan gateway (HTTP 403/429/5xx, timeout,
 * network error, respons tidak valid) tetap memotong saldo simulasi sebesar
 * estimasi maksimum tarif, walau pengguna tidak menerima jawaban apa pun
 * (terbukti live di production 2026-10-21: 10.000 → 9.980 → 9.960 → 9.910
 * untuk empat pengiriman yang semuanya gagal).
 *
 * Kontrak gerbang ini:
 * - Debit HANYA bila hasil send() menyatakan sukses secara tegas:
 *   `result.success === true` (strict — nilai truthy lain, objek kosong,
 *   null/undefined, atau bentuk tak dikenal TIDAK dianggap sukses).
 * - Fungsi debit dipanggil PALING BANYAK satu kali per pemanggilan gerbang,
 *   dan hanya pada cabang sukses.
 * - Jalur exception/cancel tidak melewati gerbang ini sama sekali
 *   (view.tsx menangani catch secara terpisah, tanpa debit).
 * - Intent lokal tidak memanggil gerbang ini (tidak ada provider, tidak
 *   ada debit) — pemanggilan gerbang hanya ada di jalur online view.tsx.
 *
 * Modul ini murni (tanpa React/tanpa state) agar dapat diuji langsung oleh
 * tes regresi `src/test/chatCreditDebit.test.ts` bersama mockAdapter asli.
 */

export interface ChatSendOutcomeLike {
  success?: unknown;
}

/** True hanya bila outcome menyatakan sukses secara tegas (success === true). */
export function shouldDebitChatCredit(outcome: ChatSendOutcomeLike | null | undefined): boolean {
  return outcome != null && outcome.success === true;
}

/**
 * Jalankan `debit` tepat satu kali bila outcome sukses tegas.
 * Mengembalikan true bila debit dijalankan.
 */
export function debitChatCreditOnSuccess(
  outcome: ChatSendOutcomeLike | null | undefined,
  debit: () => void,
): boolean {
  if (!shouldDebitChatCredit(outcome)) return false;
  debit();
  return true;
}
