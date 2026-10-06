# EZRAB — Volume Calculation Test Matrix & Verification Suite

**Document Version:** 2.0  
**Test Suite:** `server/test/volumeCalculatorsExcelParity.test.ts`  
**Execution Environment:** Vitest / Node.js ES Modules  
**Overall Result:** 26/26 Tests Passed (100% Green)

---

## 1. Test Matrix Summary

| Test ID | Module | Scenario Tested | Golden / Reference Inputs | Expected Value | Status |
|---|---|---|---|---|---|
| `TC-01` | Bowplank | Perimeter & timber calculation | P=12, L=8, C=0.6, H=1.0, R=2.0 | `42.40 m` | **PASS** |
| `TC-02` | Pondasi Batu Kali | Stone masonry volume & aanstampen | b1=0.30, b2=0.70, h=0.80, L=45.0 | `18.00 m³` | **PASS** |
| `TC-03` | Foot Plate | Concrete volume & rebar weight | P=1.0, L=1.0, t1=0.25, bk=0.25, N=12 | `3.75 m³` | **PASS** |
| `TC-04` | Sloof | Beam concrete & rebar reinforcement | P=3.0, b=0.20, h=0.30, n=5 | `0.90 m³` | **PASS** |
| `TC-05` | Kolom | Reinforced column concrete & ties | H=3.5, b=0.15, h=0.15, N=16 | `1.26 m³` | **PASS** |
| `TC-06` | Balok | Continuous beam volume & formwork | L=32.0, b=0.20, h=0.35 | `2.24 m³` | **PASS** |
| `TC-07` | Bata Ringan | Hebel wall area & mortar sacks | P=10, H=3.2, Abukaan=4.5, tebal=10 | `27.50 m²` | **PASS** |
| `TC-08` | Bata Merah | Red brick wall net area & brick count | P=10, H=3.0, Abukaan=4.0, Asop=0 | `26.00 m² (1,820 pcs)` | **PASS** |
| `TC-09` | Batako | Batako press wall net area & pieces | P=10, H=3.0, Abukaan=4.0, Asop=0 | `26.00 m² (325 pcs)` | **PASS** |
| `TC-10` | Pintu & Jendela | Frame length & door/window leaf area | PU=1, PK=4, PKM=2, JG=3, JT=4 | `20.19 m² (59.60 m')` | **PASS** |
| `TC-11` | Atap Baja Ringan | Slope area with 30° pitch | Lb=8.0, Pb=10.0, sudut=30°, O=0.80 | `128.59 m²` | **PASS** |
| `TC-12` | Plesteran & Acian | 2-side plastering & skim coat area | luasDinding=50, sisi=2, tebal=15 | `100.00 m²` | **PASS** |
| `TC-13` | Penutup Lantai | Granite floor tiling with 5% waste | P=6.0, L=5.0, waste=5%, ubin=60x60 | `30.00 m² (31.50 m² w/ waste)` | **PASS** |
| `TC-14` | Penutup Dinding | Ceramic wall tiling with net openings | K=12.0, H=2.0, Abukaan=2.0, waste=5%| `23.10 m²` | **PASS** |
| `TC-15` | Plafon | Gypsum ceiling area & frame length | P=6.0, L=5.0 | `30.00 m²` | **PASS** |
| `TC-16` | Pengecatan | Interior wall & ceiling 3-coat paint | Lint=80, Leks=0, Lplf=30 | `110.00 m²` | **PASS** |
| `TC-17` | Kelistrikan | Electrical points & conduit piping | Lampu=12, SK=8, Saklar1=4, Saklar2=2| `26.00 titik` | **PASS** |
| `TC-18` | Air Bersih | PVC AW pipe distribution length | pUtama=20, pCabang=15, nKran=5 | `35.00 m'` | **PASS** |
| `TC-19` | Sanitair | Fixture counts (WC, Sink, Shower) | Kloset=2, Wastafel=2, FD=2, Shower=4 | `10.00 unit` | **PASS** |
| `TC-20` | Baja WF Registry | SNI 07-7178 standard profiles catalog | WF 200x100x5.5x8, 150x75, 300x150 | `Verified: true` | **PASS** |
| `TC-21` | Baja WF Theoretical| Cross-section area $A \times 0.00785$ | h=200, bf=100, tw=5.5, tf=8.0 | `20.504 kg/m` | **PASS** |
| `TC-22` | Baja WF SNI Total | Total weight with plates, bolts & weld| WF 200x100 (21.3 kg/m), L=6m, n=8 btg | `1,103.22 kg (1.1032 Ton)` | **PASS** |
| `TC-23` | Baja WF Custom Mode| Theoretical custom profile weight | useTheoretical=1, L=6m, n=8 btg | `1,033.40 kg` | **PASS** |
| `TC-24` | Registry Discovery | Case-insensitive ID lookup | 'bowplank', 'baja_wf', 'sloof' | `Matched spec` | **PASS** |
| `TC-25` | Step Trace Integrity| Sequential steps & non-NaN outputs | All 20+ calculators | `All steps finite` | **PASS** |
| `TC-26` | Project Isolation | Multi-tenant ownership guard | Project context isolation | `Zero leaks` | **PASS** |

---

## 2. Parity & Formula Verification Results

- **Internal Precision**: All internal calculations use `SafeDecimalEngine` with fixed-point integer scaling.
- **Floating Point Stability**: 0.000000 drift across multiplication, division, and rounding steps.
- **Zero Fabrication**: All 19 building calculators match the real Excel master workbook cell dependencies. Baja WF is explicitly tagged as `PROPOSED / SEPARATELY SOURCED` with authoritative SNI standard backing.
