# EZRAB AHSP 2026 — MISSING SOURCE REPORT

Generated: 2026-09-28T11:52:10.386Z
Regulation: **SE DJBK No. 47/SE/Dk/2026**
Scope: Phase 0.5 §4 — "Lampiran V is PRIORITY #1"

---

## 1. Headline

> **There is no "AHSP Bidang Umum" in SE DJBK No. 47/SE/Dk/2026.**
>
> The regulation publishes **seven** annexes (I–VII). Four of them carry AHSP
> analysis tables — **III (SMKK), IV (SDA), V (Bina Marga), VI (Cipta Karya)**.
> None of them is "Bidang Umum". The brief's target of **143 Umum items** therefore
> does not correspond to any annex of this regulation and is classified
> `SOURCE_NONEXISTENT`.

The full official annex list was read from the issuing authority
(Direktorat Jenderal Bina Konstruksi) and cross-checked against the cover page of
every local PDF:

| Lampiran Batang Tubuh | Tata Cara Penyusunan Perkiraan Biaya Pekerjaan Konstruksi | download_id=10892 | no AHSP items |
| Lampiran I | Teknis pengumpulan data Harga pokok sektor konstruksi di Kementerian PU | download_id=10894 | no AHSP items |
| Lampiran II | Acuan dalam Penyusunan AHSP | download_id=10897 | no AHSP items |
| Lampiran III | Biaya Penerapan SMKK | download_id=10899 | **AHSP items** |
| Lampiran IV | AHSP Bidang SDA | download_id=10901 | **AHSP items** |
| Lampiran V | AHSP Bidang BINA MARGA | download_id=10903 | **AHSP items** |
| Lampiran VI | AHSP Bidang CIPTA KARYA | download_id=10904 | **AHSP items** |
| Lampiran VII | Tata Cara Pengajuan Usulan AHSP | download_id=10906 | no AHSP items |

Source page: https://binakonstruksi.pu.go.id/produk/produk-hukum/surat-edaran-direktur-jenderal-bina-konstruksi-nomor-47-se-dk-2026/

---

## 2. "Lampiran V" was found — it is the Bina Marga annex

Phase 0.5 §4 asked, first, to locate Lampiran V. It was **already in the
repository, mislabelled**.

| Evidence | Finding |
|---|---|
| Local file name | `Lampiran-II-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf` |
| Its own **cover page** (page 1) | reads `LAMPIRAN V … AHSP Bidang Bina Marga` |
| MD5 | `96e4a1b33f7b514ea785baf6086bcd80` |
| Official download `download_id=10903` (Lampiran V) | MD5 `96e4a1b33f7b514ea785baf6086bcd80` — **identical** |
| Cross-reference inside Lampiran VI (Cipta Karya) | *"untuk AHSP Jalan Aspal dapat mengacu pada SE Dirjen Bina Konstruksi **Lampiran V Bidang Bina Marga**"* |
| Printed page range in the compiled SE | SMKK ~207–280 → SDA 281–1969 → **Bina Marga 1970–5093** → Cipta Karya 5094–6656 |

**Conclusion:** the file is the genuine Lampiran V (AHSP Bidang Bina Marga). The
`Lampiran-II` prefix in its file name is wrong. All Bina Marga items in the
master dataset now carry `source.attachment = "V"`.

A correctly-named copy was placed at
`sources/ahsp2026/Lampiran-V-SE-DJBK-No-47-Tahun-2026-AHSP-Bidang-Bina-Marga.pdf`
and the pipeline now reads from that canonical folder.

---

## 3. The genuinely missing annex — Lampiran II

While hunting for Lampiran V, the **actually absent** annex was found: Lampiran II
was never downloaded.

| Field | Value |
|---|---|
| Annex | **Lampiran II** |
| Official title | **Acuan dalam Penyusunan AHSP** |
| download_id | 10897 |
| Pages | 85 |
| AHSP items? | **No** — reference tables only |
| Status | **NOW ACQUIRED** (Phase 0.5) |

### 3.1 Content verification (why it contributes no items)

Lampiran II was extracted page-by-page and scanned for the markers an itemised
AHSP annex must have:

| Marker | Occurrences in Lampiran II |
|---|---|
| `BIDANG UMUM` | 0 |
| `DAFTAR` (any index) | 0 |
| `DIVISI` | 0 |
| AHSP item codes (`A.1.01` style) | 0 |
| `Tabel A.x` reference tables | 260 |
| `Koefisien` (formula text) | 86 |

Its content is: *Faktor Konversi Bahan* (Tabel A.1…A.36), compaction/buckling
factors, material conversion factors, and equipment productivity formulas
(Wheel Loader, AMP, etc.). It is a **calculation reference**, exactly like
Lampiran I. It contains **no code index and no analysis tables**, so it correctly
contributes **zero** items to the master dataset and is recorded as a
`GUIDANCE` annex.

### 3.2 Why it looked "missing"

Two annexes of this SE are non-AHSP guidance (`I` and `II`), and one is
procedural (`VII`). Only `III`, `IV`, `V`, `VI` yield items. A pipeline that
expects "one annex = one bidang" will therefore report a phantom gap for every
guidance annex.

---

## 4. Paths and patterns that were searched (§3)

Searched exhaustively (both drives, excluding `node_modules`):

| Location | Result |
|---|---|
| `D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\AHSP 2026\` | Lampiran III, IV, VI + a file named `5.-Lampiran-V-Bidang-Bina-Marga-ok.pdf` |
| `D:\file kerja\**` (pattern `*lampiran*`, `*umum*`, `*AHSP*`) | no Lampiran V, no Bidang Umum |
| `C:\Users\mbekd\Downloads\Documents\` | Lampiran I, III, IV, VI |
| `C:\Users\mbekd\OneDrive\Documents\` | Lampiran II **file name** — but its content is Bina Marga (Lampiran V) |
| `D:\file kerja\Arsi & Konstruksi\RAB\…` | AHSP Cipta Karya under **SE 30/2025** — a *different* regulation, not usable |

### 4.1 Look-alike that was ruled out

`5.-Lampiran-V-Bidang-Bina-Marga-ok.pdf` (in `ezrab folder\AHSP 2026\`) is
**byte-identical** to the Bina Marga file (both 21,577,263 bytes, MD5
`96e4a1b33f7b514ea785baf6086bcd80`). The `5.` prefix is a folder sequence
number, not a lampiran number. It is **not** a separate Lampiran V of Bidang Umum.

### 4.2 Wrong-regulation look-alikes

The following were found but are **not** sources for this task:

- `AHSP CIPTA KARYA SE BINA KONSTRUKSI NO 30 TAHUN 2025` — SE 30/2025
- `SE-DJBK-No-68-2024-Lampiran-VI_CK.pdf` — SE 68/2024
- `AHSP CK 2026_UNLOCKED.xlsx` — session backup, no provenance

Using any of these would import coefficients from a superseded regulation.

---

## 5. What was NOT done

Per Phase 0.5 §2 and §4:

- ❌ No 143 Umum items were created, inferred, or borrowed from another regulation.
- ❌ The target was not silently reduced; it is reported as `SOURCE_NONEXISTENT`
  with the evidence above.
- ❌ No deprecated in-repo dataset was used as a source of truth.
- ❌ No Supabase import, no UI change, no RAB change.

---

## 6. Required action (human decision)

The 143-item Umum target must be resolved by the project owner. The options are:

1. **Drop it** — SE 47/2026 has no Bidang Umum AHSP. Recommended.
2. **Re-scope it** — if "Umum" meant the *Bina Marga* DIVISI 1 (Pekerjaan Umum)
   or the generic items inside Lampiran V/VI, say so explicitly and it will be
   re-derived from that annex with the correct provenance.
3. **Point at the old regulation** — if the intent is Permen PUPR No. 8 Tahun 2023
   "Bidang Umum", that is a *different* regulation and needs its own dataset and
   its own source file.

Until that decision is made, the master dataset reports **0 Umum items** and the
gap is documented rather than filled.
