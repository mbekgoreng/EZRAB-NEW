# EZRAB — Remediation Roadmap (Audit 2026-10-20)

Urutan berdasarkan prioritas × dependensi. Semua butir butuh persetujuan owner sebelum eksekusi (audit ini read-only). Effort: S ≤ ½ hari, M = 1–2 hari, L > 2 hari / lintas fase.

## Gelombang 0 — Aksi owner di dashboard (tanpa kode)
| # | Aksi | Menutup | Penerimaan |
|---|---|---|---|
| 0.1 | Verifikasi di Vercel bahwa deployment production = build branch terkini (SUDAH terverifikasi sinkron 2026-10-20 — pertahankan kebiasaan cek hash aset tiap promosi) | kebersihan rilis | Aset live bertanggal hari promosi; /api/ai/engine-status "ready" |
| 0.2 | Pasang/verifikasi di Vercel: AI_GATEWAY_TOKEN (+ token client), kunci provider BARU (Dahl/River/Gemini-OAI — provider lama Gemini/ZyRouter/Atria sudah terkonfigurasi), SERPER_API_KEY | SEC-03, B3 | engine-status sehat; kunci baru terbaca backend (perlu endpoint status diperbarui agar menghitung provider baru) |
| 0.3 | Rotasi 8 secret lama | B4 | Kunci lama mati di dashboard provider |
| 0.4 | Putuskan harga kredit: Rp1.389 vs Rp10.000 per 1.000 | CR-10 | Satu angka tertulis di config & pricing |

## Gelombang 1 — Perbaikan kode cepat (S–M, risiko regresi rendah)
| # | Aksi | Menutup | Penerimaan |
|---|---|---|---|
| 1.1 | Hapus awalan `=` pada 18 formula Excel + test regresi anti-`=` | EXP-01 | Workbook hasil ekspor: formula jadwal/Kurva-S/cashflow menghitung ulang, bukan teks mati |
| 1.2 | Terapkan applyCors + authenticateRequest + rateLimit pada market/search (satu-satunya endpoint di luar gateway terpadu); samakan format errornya | SEC-09, SEC-19 | OPTIONS asing ditolak; error 500 generik tanpa e.message |
| 1.3 | Petakan EZRAB_AI → mode 'chat' di tools/execute (atau hapus chat.js + toggle Mendalam); tampilkan provider aktual di UI hasil | AI-01, AI-03, AI-08 | Chat memakai rantai NVIDIA-first; label mode sesuai eksekusi |
| 1.4 | Tambah security headers di vercel.json (CSP, nosniff, Referrer-Policy, frame-ancestors; HSTS sudah dari platform) | SEC-16 | Header hadir di respons live |
| 1.5 | Chat: potong kredit hanya saat sukses + hormati nilai balik consume di 3 titik; label draft pada finalizeCredits | CR-08 (frontend), CR-04 | Respons gagal tidak mengurangi saldo simulasi |
| 1.6 | engine-status: ringkasan sehat saja / gerbang token; jangan fail-open 'ready-simulated' | SEC-17 | Respons publik tanpa topologi provider |
| 1.7 | Samakan kebijakan pembulatan resolver + perbarui invariant test:price sesuai keputusan arsitektur canonical | RAB-01, AHSP-01 | `npm run test:price` hijau 67/67 |

## Gelombang 2 — Pengerasan (M)
| # | Aksi | Menutup |
|---|---|---|
| 2.1 | Rate-limit bersama (KV/Redis) untuk semua endpoint AI; deadline total + dedup percobaan gateway | SEC-10, AI-02 |
| 2.2 | Pesan error generik + request-id di chat; log metadata saja (tanpa isi pesan) | SEC-11, SEC-12 |
| 2.3 | Hapus 12 file API mati; samakan perintah build (satu sumber) | INF-12, INF-05 |
| 2.4 | Jalankan npm audit dari mesin owner/CI (terblokir di sandbox audit) lalu tangani kerentanan kritis yang terkonfirmasi | INF-07 | Laporan audit dependency tersimpan |
| 2.5 | scroll-margin untuk semua anchor landing; samakan daftar origin CORS (www) | UX-03, SEC-07 |
| 2.6 | Batas ukuran + magic-byte upload DED/dokumen di server | SEC-13 |

## Gelombang 3 — Aktivasi backend (L, menunggu VPS — keputusan owner 2026-10-18)
| # | Aksi | Menutup |
|---|---|---|
| 3.1 | Adapter ledger Supabase + constraint idempotency DB; wajibkan auth pada /api/credits/*; perbaiki reserve()/release() + unit test engine | CR-02, CR-03, CR-05, CR-06 |
| 3.2 | Isi tarif provider nyata (model yang dipakai) + FX; rekonsiliasi biaya vs kredit | CR-01 |
| 3.3 | Nyalakan AUTH (flag build, bukan localStorage); validasi JWT pengguna di tools; uji RLS negatif; matikan mode demo ?demo= | SEC-01, SEC-04, SEC-05, SEC-02 |
| 3.4 | Lazy-load canonical AHSP (code-split data per domain) | INF-06, UX-04 |
| 3.5 | Meterai QA lanjutan Dokumen AI; gerbang saldo server sebelum panggilan AI | CR-09, CR-08 (server) |

## Gelombang 4 — Data
| # | Aksi | Menutup |
|---|---|---|
| 4.1 | Verifikasi SE DJBK 47/2026 → tutup antrean 1.048 NEEDS_REVIEW, 50 SMKK AMBIGUOUS, 1 SOURCE_DEFECT, 335 harga unresolved | AHSP-01 |

## Aturan main selama remediasi
Satu gelombang per persetujuan; setiap perbaikan ditutup dengan test penerimaan di kolomnya; tidak ada perubahan tarif/harga/data AHSP tanpa bukti sumber; tidak ada migrasi DB tanpa persetujuan eksplisit terpisah.
