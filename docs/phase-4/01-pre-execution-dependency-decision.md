# PHASE 4 — PRE-EXECUTION DEPENDENCY DECISION

**Tanggal:** 14 September 2026  
**Status:** APPROVED & DOCUMENTED  

---

## 1. Analisis Kebutuhan Rendering 3D

Phase 4 membutuhkan viewer 3D parametrik interaktif dengan fitur:
- Rotasi 3D bebas (Orbit), Geser (Pan), Zoom;
- Render Mode: Solid Shaded, Wireframe Blueprint, Transparent X-Ray;
- Element Picking (Raycasting 3D -> Deteksi elemen yang diklik);
- Layer Visibility Toggles (Pondasi, Struktur, Dinding, Atap, Finishing);
- Lifecycle Cleanup (bebas dari memory leak context WebGL).

---

## 2. Opsi Evaluasi Dependency

| Opsi | Kelebihan | Kekurangan | Keputusan |
|---|---|---|---|
| **Opsi A: `three` + `@types/three` murni** | - Standar industri WebGL 3D.<br>- Mendukung OrbitControls, Raycaster, Dynamic Buffers, Lines, Mesh.<br>- Kontrol siklus hidup WebGL 100% transparan.<br>- Kompatibel penuh dengan React 19 tanpa ketergantungan hook pihak ketiga. | - Perlu mengelola canvas `ref` dan cleanup lifecycle secara manual di React `useEffect`. | **DIPILIH (RECOMMENDED)** |
| **Opsi B: `@react-three/fiber` + `@react-three/drei`** | - Abstraksi deklaratif JSX. | - Potensi ketidakcocokan versi dengan React 19 (`peerDependencies` conflict).<br>- Bundle size bertambah signifikan (+350KB).<br>- Kurang transparan untuk unit testing pure TypeScript. | **DITOLAK** |
| **Opsi C: Custom Canvas 2D / Isometric SVG (`diagrams.tsx`)** | - Zero new dependencies. | - Bukan true 3D (tidak bisa orbit kamera 360°, orientasi sudut terbatas, tidak ada kedalaman z-buffer sejati). | **DITOLAK SEBAGAI VIEWER UTAMA** (Tetap dipertahankan sebagai diagram 2D QTO) |

---

## 3. Dependency yang Ditambahkan

```bash
npm install three @types/three
```

- **Nama Paket:** `three`, `@types/three`
- **Tujuan:** Engine render WebGL 3D parametrik untuk visualisasi wireframe dan solid model.
- **Dampak Bundle:** ~140 KB (setelah tree-shaking & minification gzip).
- **Risiko Keamanan:** 0 CVE (Three.js adalah open-source library mature).
- **Strategi Pembersihan Memori:** Implementasi `dispose()` pada seluruh Geometries, Materials, dan Renderer saat komponen di-unmount.
