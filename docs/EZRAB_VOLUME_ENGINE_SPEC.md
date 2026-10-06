# EZRAB — Volume Calculation Engine Specification

**Document Version:** 2.0  
**Status:** PRODUCTION-GRADE / DETERMINISTIC SOURCE OF TRUTH  
**Workbook Reference:** `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx` (4,420,149 bytes, 24 worksheets)  
**Standard Profiles Reference:** SNI 07-7178-2006 / Gunung Garuda Catalog  

---

## 1. Executive Overview & Architecture

The **EZRAB Volume Calculation Engine** is the deterministic calculation foundation for quantity take-off (QTO), Work Breakdown Structure (WBS), and Cost Estimation (RAB) within the EZRAB SaaS Construction Platform.

```
┌─────────────────────────────────────────────────────────────┐
│                 INPUT LAYER (Parametric / DED)              │
│       User Inputs / DED Document Extraction / AI Suggester   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                DETERMINISTIC ENGINE CORE                     │
│         • SafeDecimalEngine (Fixed-point arithmetic)        │
│         • Parameter Validation & Boundary Guard             │
│         • 6-Decimal Internal Precision (Zero float drift)   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌──────────────────────────────┐    ┌─────────────────────────────┐
│    19 EXCEL-PARITY MODULES   │    │     BAJA WF (STRUCTURAL)    │
│  Bowplank, Pondasi, Sloof,   │    │  SNI 07-7178-2006 Profiles  │
│  Kolom, Balok, Dinding,      │    │  Theoretical A*0.00785 mode │
│  Plesteran, Lantai, Plafon.. │    │  [PROPOSED/SEPARATELY SOURCED│
└──────────────┬───────────────┘    └──────────────┬──────────────┘
               │                                   │
               └──────────────────┬────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    CALCULATION RESULT                       │
│      • Primary Quantity & Standard SI Unit                  │
│      • Full Material & Labor AHSP Breakdown                 │
│      • Step-by-Step Formula Substitution Trace              │
│      • Technical Notes & Compliance Badges                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              DOWNSTREAM PIPELINE (Strict Isolation)         │
│   Project Context ➔ QTO Record ➔ WBS / AHSP ➔ Final RAB    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Engineering Principles

1. **Deterministic Parity with Master Excel**:
   - The 19 core residential and commercial calculators follow the exact cell math derived from `EZRAB_VOLUME_CALCULATOR_MASTER.xlsx`.
   - Mid-formula rounding is prevented; intermediate calculations maintain full precision before display formatting.

2. **Structural Steel (Baja WF) Status**:
   - Explicitly classified as `STATUS: PROPOSED / SEPARATELY SOURCED` because the original workbook did not contain an explicit WF calculation sheet.
   - Profile specifications are authoritatively backed by **SNI 07-7178-2006 (Gunung Garuda Steel Table)**.
   - Theoretical calculation mode computes cross-sectional area:
     $$A = 2 \times b_f \times t_f + (h - 2 \times t_f) \times t_w \quad (\text{mm}^2)$$
     $$\text{Nominal Weight} = A \times 0.00785 \quad (\text{kg/m})$$

3. **Safe Decimal Engine & Numerical Stability**:
   - All financial and dimensional multiplications utilize scaled integer arithmetic to prevent IEEE 754 floating-point drift (e.g., $100000 \times 0.125 = 12500$ exactly).

4. **Multi-Tenant Project Isolation**:
   - Every calculation run requires a verified `projectId`. Hardcoded or orphaned calculations are strictly prohibited.

---

## 3. Calculator Modules Inventory

| # | Calculator ID | Category | Excel Reference Sheet | Primary Output & Unit | AHSP Default Code |
|---|---|---|---|---|---|
| 01 | `BOWPLANK` | Pekerjaan Persiapan | `Bowplank` | Keliling Perimeter (m) | `A.2.2.1.4` |
| 02 | `PONDASI` | Pekerjaan Pondasi | `Pondasi` | Pasangan Batu Kali ($m^3$) | `A.3.2.1.2` |
| 03 | `FOOT_PLATE` | Pekerjaan Pondasi | `Foot Plate` | Beton Foot Plate ($m^3$) | `A.4.1.1.5` |
| 04 | `SLOOF` | Pekerjaan Struktur | `Sloof` | Cor Beton Sloof ($m^3$) | `A.4.1.1.25` |
| 05 | `KOLOM` | Pekerjaan Struktur | `Kolom` | Cor Beton Kolom ($m^3$) | `A.4.1.1.26` |
| 06 | `BALOK` | Pekerjaan Struktur | `Balok` | Cor Beton Balok ($m^3$) | `A.4.1.1.27` |
| 06B| `BAJA_WF` | Pekerjaan Struktur | *Separately Sourced (SNI 07-7178)* | Total Berat Baja WF (kg) | `A.4.2.1.1` |
| 07 | `BATA_RINGAN` | Pekerjaan Dinding | `Bata Ringan` | Luas Dinding Hebel ($m^2$) | `A.4.4.1.14` |
| 08 | `BATA_MERAH` | Pekerjaan Dinding | `Bata Merah` | Luas Pasangan Bata ($m^2$) | `A.4.4.1.9` |
| 09 | `BATAKO` | Pekerjaan Dinding | `Batako` | Luas Pasangan Batako ($m^2$) | `A.4.4.1.12` |
| 10 | `PINTU_JENDELA` | Pekerjaan Arsitektur | `Pintu & Jendela` | Luas Daun Pintu/Jendela ($m^2$) | `A.4.6.1.5` |
| 11 | `ATAP_BAJA_RINGAN`| Pekerjaan Atap | `Atap Baja Ringan` | Luas Bidang Atap ($m^2$) | `A.4.2.1.21` |
| 12 | `PLESTERAN_ACIAN` | Pekerjaan Finishing | `Plesteran & Acian` | Luas Plesteran ($m^2$) | `A.4.4.2.4` |
| 13 | `PENUTUP_LANTAI` | Pekerjaan Finishing | `Penutup Lantai` | Luas Penutup Lantai ($m^2$) | `A.4.4.3.35` |
| 14 | `PENUTUP_DINDING` | Pekerjaan Finishing | `Penutup Dinding` | Luas Keramik Dinding ($m^2$) | `A.4.4.3.50` |
| 15 | `PLAFON` | Pekerjaan Finishing | `Plafon` | Luas Plafon Gypsum ($m^2$) | `A.4.5.1.7` |
| 16 | `PENGECATAN` | Pekerjaan Finishing | `Pengecatan` | Total Luas Cat ($m^2$) | `A.4.7.1.10` |
| 17 | `KELISTRIKAN` | Pekerjaan MEP | `Kelistrikan` | Total Titik Listrik (titik) | `A.8.1.1.1` |
| 18 | `AIR_BERSIH` | Pekerjaan MEP | `Instalasi Air Bersih` | Total Panjang Pipa (m) | `A.5.1.1.2` |
| 19 | `SANITAIR` | Pekerjaan MEP | `Sanitair` | Total Unit Sanitair (unit) | `A.5.1.1.15` |

---

## 4. Technical Reference Graphics Architecture

Technical reference drawings are served directly from the public asset directory to eliminate machine-specific Windows file paths:
- **Base URI:** `/assets/volume-calculation/references/`
- **Supported Interactions:** Pan, Zoom In/Out, Reset, Fullscreen inspection, Blueprint dimension overlays.
- **Reference Assets:**
  - `blowplank.jpg`
  - `pondasi.jpg`
  - `footplate.jpg`
  - `sloof.jpg`
  - `kolom.jpg`
  - `BALOK.jpg`
  - `atap pelana baja ringan.jpg`
  - `atap limas baja ringan.jpg`
  - `bata ringan.jpg`
  - `bata merah.jpg`
  - `batako.jpg`
  - `pintu dan jendela.jpg`
  - `lantai keramik.jpg`
  - `dinding keramik.jpg`
  - `plafon.jpg`
  - `pengecatan.jpg`
  - `air bersih.jpg`
