# EZRAB — GEOMETRY & VISION INTEGRATION CONTRACT
## Multi-Disciplinary 3D/2D Visualizations and Vision AI DED Extraction

**Status:** AUDIT & DESIGN ONLY — IMPLEMENTATION NOT STARTED  
**Auditor:** BIM/Parametric Engineer, Vision AI Specialist  
**Date:** 2026-09-14  
**Project:** EZRAB AI — Intelligent Construction Cost Estimation Engine  

---

## 1. Arsitektur Geometry Adapter Multi-Disiplin

Saat ini `geometryAdapters.ts` mengasumsikan seluruh model adalah gedung kotak. Untuk mendukung 37+ template multidisiplin, arsitektur geometri diperluas menggunakan pola **Geometry Adapter Strategy**:

```
                   ┌──────────────────────────────────┐
                   │    GEOMETRY ADAPTER REGISTRY     │
                   └────────────────┬─────────────────┘
                                    │
    ┌─────────────────┬─────────────┼─────────────┬─────────────────┐
    │                 │             │             │                 │
┌───▼─────────┐ ┌─────▼───────┐ ┌───▼─────────┐ ┌─▼───────────┐ ┌───▼─────────┐
│  Building   │ │   Linear    │ │  Drainage   │ │  Hydraulic  │ │   Bridge    │
│ 3D Adapter  │ │  Road/Pave  │ │ Cross-Sect  │ │ Dam Profile │ │ 3D Adapter  │
│             │ │ 3D Adapter  │ │ 2D/3D Model │ │  3D Model   │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 2. Antarmuka Geometry Adapter

```typescript
export interface IGeometryAdapter {
  readonly discipline: EngineeringDiscipline;
  canHandle(templateId: string): boolean;
  
  // Menghasilkan node geometri wireframe & solid lightweight Three.js
  generateModel(
    template: ExtendedMasterBuildingTemplate,
    parameters: Record<string, any>
  ): {
    nodes: GeometryNode3D[];
    structuralElements: StructuralElementNode[];
    boundingBox: BoundingBox3D;
    cameraPresets: CameraPreset[];
    dimensions: DimensionAnnotation3D[];
  };
}
```

### Klasifikasi Visualisasi per Disiplin:

1. **Building (Hotel, RS, Gedung, Gudang)**:
   - Visualisasi: 3D Wireframe + Translucent Slabs + Column Grid + Roof Truss Envelope.
2. **Road & Pavement (Jalan Aspal, Beton, Paving)**:
   - Visualisasi: 3D Extruded Corridor Roadway + Layer Stacking Visualizer (Subgrade > LPB > LPA > Hotmix / Paving).
3. **Drainage (Open Channel, Box Culvert, U-Ditch)**:
   - Visualisasi: 3D Longitudinal Trench + 2D Interactive Cross-Section with Hydraulic Water Level Line ($h_{water}$).
4. **Water Resources (Dam, Spillway, Embung)**:
   - Visualisasi: 3D Mass Profile + Dam Axis Grid + Elevation Station Contours.
5. **Civil Structure (Jembatan, Retaining Wall, Bronjong)**:
   - Visualisasi: 3D Abutment-Pier-Deck Wireframe + Reinforcement Cage Outline + Weep Hole Pattern.

---

## 3. Kontrak Integrasi Vision AI DED Extraction (Phase 5 Bridge)

Vision AI bertugas membaca gambar kerja (PDF/raster DED) dan **hanya bertindak sebagai pengusul parameter (*parameter candidate generator*)**, tidak pernah menjadi penentu akhir volume atau biaya RAB.

```
┌────────────────────────┐
│  PDF / CAD / DED Image │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Vision AI OCR / LLM    │ ───► Ekstraksi teks dimensi, legenda, tabel spesifikasi
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Proposed Parameter     │ ───► JSON Parameter Validated (Field null/unknown jika tidak ditemukan)
│ Payload                │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Human Review & Confirm │ ───► Estimator memverifikasi / mengoreksi parameter
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Parametric Volume      │ ───► KALKULASI DETERMINISTIK FINAL (Volume x AHSP 2026 x Regional Price)
│ Engine                 │
└────────────────────────┘
```

### Kamus Pemetaan Key Vision AI per Disiplin:

| Disiplin | Key Parameter Vision AI | Satuan Target | Deskripsi DED |
| :--- | :--- | :--- | :--- |
| **Building** | `buildingArea`, `buildingLength`, `buildingWidth`, `numberOfFloors`, `floorToFloorHeight`, `wallMaterial` | $m^2, m, m$ | Dimensi denah arsitektur & potongan melintang gedung |
| **Road & Pavement** | `roadLength`, `carriagewayWidth`, `shoulderWidth`, `lpaThickness`, `acwcThickness`, `cbrSubgrade` | $m, m, cm, \%$ | Profil tipikal jalan melintang (*Typical Cross Section*) |
| **Water Resources** | `crestElevation`, `damHeight`, `crestLength`, `crestWidth`, `upstreamSlope`, `downstreamSlope`, `reservoirCapacity` | $m, m, m, m^3$ | Potongan memanjang & melintang bendungan/embung |
| **Drainage** | `channelLength`, `bottomWidth`, `waterDepth`, `freeboardHeight`, `sideSlopeM`, `liningThickness` | $m, m, m$ | Detail penampang basah saluran drainase |
| **Civil & Structure** | `bridgeSpanLength`, `clearWidth`, `numberOfGirders`, `girderHeight`, `abutmentHeight`, `pileDiameter` | $m, m, m, cm$ | Gambar tampak jembatan & penampang gelagar |

---

## 4. Kebijakan Keamanan & Integritas Data

1. **Zero Black-Box Costing**:  
   Vision AI dilarang menghasilkan string harga satuan atau total biaya. Seluruh harga satuan harus berasal dari database resmi `nationalCostDatabase` terindeks AHSP PUPR 2026.
2. **Confidence Threshold & Visual Flag**:  
   Setiap parameter yang diekstraksi Vision AI dengan confidence $< 0.85$ wajib ditandai warna kuning (*Amber Warning*) pada antarmuka peninjauan (*Review Modal*) sebelum dieksekusi oleh `ParametricVolumeEngine`.
