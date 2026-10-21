# EZRAB — AI Credits & Cost Audit (2026-10-20)

Metode: review statis `api/_lib/aiGateway.js`, `creditEngine.js`, `creditPricing.js`, `providerTariffs.js`, `usageMeter.js`, endpoint `api/credits/*`, frontend `src/ai-credits/` + titik `consume()`. Nilai kunci tidak dicatat.

## Putusan: SIMULASI JUJUR, BUKAN SISTEM BILLING
Seluruh rantai kredit saat ini adalah **simulasi frontend yang dilabeli jujur**. Tidak ada debit server, tidak ada ledger persisten, dan biaya provider **tidak dapat dihitung sama sekali** (semua tarif NULL). Aman dari sisi uang (tidak ada transaksi nyata), tidak aman dari manipulasi — sesuai desain Fase 1.

## 1. Alur aktual
UI → `useCreditSimulation` → `mockAdapter` (state memori modul) → selesai. Endpoint backend `/api/credits/*` hanya dipanggil satu kali oleh frontend: GET usage untuk panel tampilan (CreditPage) yang dengan jujur menampilkan "Backend usage meter belum aktif" saat 503.

## 2. Temuan

### CR-02 — Tidak ada ledger server; usage dihitung lalu dibuang — **P1 · CONFIRMED**
- `api/_lib/aiGateway.js:405` memanggil `createUsageMeter(null)`; `usageMeter.record()` menghitung entri (termasuk `credits_charged` dari tarif draft) lalu **tidak menyimpannya ke mana pun**. Gateway tidak pernah mengimpor `creditEngine` — tidak ada debit server untuk siapa pun, kapan pun.
- Satu-satunya adapter penyimpanan di codebase adalah `createMemoryAdapter` (creditEngine.js:66); tidak ada adapter Supabase di `api/`.

### CR-01 — Tarif provider 100% NULL; model produksi tidak ada di tabel — **P1 · CONFIRMED**
- `providerTariffs.js:22-53`: semua `inputPer1M/outputPer1M = null`, `configured:false`; `usdToIdr = null`. Hanya 3 model terdaftar; model yang benar-benar dipakai gateway hari ini (River NVIDIA Nemotron, DeepSeek via River/Dahl, Gemini-OAI 3.8-flash) mengembalikan `MODEL_UNKNOWN`.
- Akibat: `computeProviderCost` tidak pernah bisa berstatus ACTUAL → biaya & margin per request **tidak terhitung**. Disiplin NULL ini jujur by design; gap-nya adalah nol visibilitas biaya.

### CR-03 — Endpoint credits menyesatkan bila flag konfigurasi dibalik — **P2 · CONFIRMED (kode)** *(severity diselaraskan: dua dari tiga jalur audit menilai P2 — laten, tertutup gerbang 503 saat ini)*
- Kondisi kini aman: tanpa `CREDITS_DB_CONFIGURED='true'` → 503 jujur `CREDITS_NOT_CONFIGURED`.
- Bila flag dinyalakan tanpa adapter nyata: balance/usage mengembalikan adapter memori kosong per-invokasi berlabel `simulated:false`, dan request tanpa auth jatuh ke userId `'anonymous'` tetap HTTP 200 (balance.js:30-31; usage.js memakai `createUsageMeter(null)` → selalu `[]`).
- `estimate.js`: tanpa auth sama sekali, mengembalikan estimasi tarif draft berlabel `simulated:false`.
- Aturan keras: **jangan pernah menyalakan flag sebelum adapter DB nyata ada**; wajibkan `auth.ok` (tolak anonymous); labeli estimate sebagai draft.

### CR-08 — Saldo tidak cukup tidak pernah memblokir AI — **P1 · CONFIRMED**
Semua titik `consume()` mengabaikan nilai balik boolean yang memang disediakan untuk penolakan:
- Chat AI (ezrab-ai/view.tsx:343-347): consume berjalan **setelah** respons AI — dan juga berjalan saat `res.success === false` (saldo simulasi terpotong untuk respons gagal).
- DED AI (DedAiInputView.tsx:113-117): satu-satunya gerbang adalah checkbox persetujuan; UI sendiri menyatakan saldo di bawah estimasi tetap bisa lanjut.
- DocAnalyzer (:140): setelah sukses, nilai balik diabaikan.
- Dampak kini kosmetik (simulasi); tetapi port Fase 2 yang menyalin pola ini mewarisi lubangnya.

### CR-04 — Label "Aktual terverifikasi" untuk tarif draft — **P2 · CONFIRMED**
`creditPricing.js:79-94`: `finalizeCredits` memotong **estimasi maksimum** apa pun usage aktualnya (`estimate_based_draft`) namun memberi stempel `label:'Aktual terverifikasi (kebijakan draft)'`. Berisiko disajikan UI/ledger masa depan sebagai tagihan terverifikasi. Ganti label menjadi "Estimasi (kebijakan draft)".

### CR-05 — Akuntansi reservasi engine tidak konsisten (dorman) — **P2 · CONFIRMED**
`creditEngine.js:206-286`: `reserve()` mengurangi bucket sebesar maxCredits **dan** menaikkan `reserved` sejumlah sama → `available = total − reserved` turun 2× lipat; `releaseReservation()` tidak mengembalikan sisa ke bucket dan menulis entri ledger `credits: 0`. Reservasi yang selesai menghancurkan permanen jumlah penuh yang direservasi. `debit`/`grant` sebaliknya sehat (validasi integer, dedupe idempotency, perlindungan saldo negatif). Belum ada endpoint yang memanggil reserve — perbaiki + unit test sebelum dipakai.

### CR-06 — Idempotency hanya di memori — **P2 · CONFIRMED**
Kunci unik `(user_id, idempotency_key)` hanya berupa Set per-instance di memory adapter (creditEngine.js:70,85) — efemeral di serverless. Wajib menjadi constraint DB pada Fase 2.

### CR-10 — Harga kredit pada penawaran top-up ≠ asumsi skema — **P2 · CONFIRMED (keputusan owner)**
- Tarif UI = tarif backend (identik, sama-sama draft): chat fast 5–20, advanced 20–50, dokumen 50–100/100–250, DED 500/650/800, revisi 100–300.
- Penawaran top-up (`src/ai-credits/config.ts:26-34`): **Rp5.000 → 3.000 kredit + bonus 20% = 3.600 kredit ≈ Rp1.389 per 1.000 kredit**.
- Asumsi skema pada master prompt audit: Rp10.000 per 1.000 kredit — penawaran terimplementasi **±7,2× lebih murah**. Salah satu harus diputuskan owner; audit tidak mengubah keduanya.
- Kuota: Starter 10.000 / Pro 20.000 kredit per periode; expiry "belum ditentukan".

### CR-09 — Tanya-jawab lanjutan Dokumen AI tidak dimeterai — **P3 · CONFIRMED**
DocAnalyzer hanya memotong pada analisis awal; `askQuestion()` memanggil provider tanpa consume — panggilan provider gratis tanpa batas dalam satu sesi dokumen.

## 3. Gateway AI — temuan terkait biaya & routing
- **AI-01 (P1 · CONFIRMED)** — View Chat AI utama tidak memakai rantai `chat`: frontend mengirim `productId:'EZRAB_AI'` ke `/api/ai/tools/execute` yang memetakan semua selain `DED_AI_DETAIL` ke `fast` (execute.js:11-14). Endpoint `api/ai/chat.js` (rantai NVIDIA-first sesuai arahan owner) hanya terujuk oleh konfigurasi baseUrl aiApiClient tanpa pemanggil UI terkonfirmasi — rantai chat tidak menjangkau pengguna Chat AI. Toggle UI "Mendalam/ADVANCED" tidak mengubah apa pun di server.
- **AI-03 (P2 · CONFIRMED)** — Mode `advanced` diam-diam jatuh ke ekor generik (Atria → Dahl/DeepSeek → River → Gemini-OAI, aiGateway.js:295-299), melampaui rantai terdokumentasi (ZyRouter → Gemini lite). Klaim registry "tidak ada substitusi diam-diam" tidak benar di level sistem; pekerjaan DED_AI_DETAIL dapat dijawab DeepSeek sambil disajikan sebagai "Deep Engine". Provider aktual memang dikembalikan/dilog — bukan disembunyikan — tetapi tidak ditampilkan di UI hasil.
- **AI-02 (P3)** — Mode chat menambahkan seluruh kunci Dahl & River dua kali (cabang + ekor) → latensi gagal berlipat (55 dtk/percobaan).
- **Latensi ekor panjang**: tanpa deadline total/circuit breaker, mode fast dapat membangun ±133 percobaan × 55 dtk — jauh melampaui timeout klien 90 dtk & batas fungsi Vercel sebelum mencapai provider sehat.
- **PASS**: fail-closed tanpa kunci (502 jujur), validasi input/media kuat (pesan ≤20rb char, body ≤4MB, allowlist MIME, batas lampiran), prompt kebijakan server selalu didahulukan & tidak dapat ditimpa klien.

## 4. Rekonsiliasi
Ledger vs saldo: **tidak dapat direkonsiliasi** — tidak ada ledger persisten. Riwayat di UI berasal dari memori sesi dan terhapus saat refresh (CR-07 frontend: semua pengguna — termasuk anonim — mulai sebagai "starter" 10.000 kredit simulasi; top-up berupa tombol mock gratis tanpa batas, berlabel simulasi).
