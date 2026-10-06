# EZRAB — RESOLUSI TEMPLATE & MAPPING ENGINE (TEMPLATE RESOLUTION)
**Dokumen:** `docs/interactive-rab-wizard/04-template-resolution.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. STRUKTUR TEMPLATE RESOLVER

`TemplateResolver` bertindak sebagai jembatan tunggal antara pilihan template pengguna dengan modul engine kalkulator matematis dan katalog AHSP PUPR.

```typescript
export interface TemplateDefinition {
  templateId: string;
  name: string;
  category: 'BUILDING' | 'ROAD_AND_PAVEMENT' | 'WATER_RESOURCES' | 'CIVIL_STRUCTURE';
  subCategory: string;
  description: string;
  icon: string;
  requiredParameters: string[];
  optionalParameters: string[];
  defaultValues: Record<string, any>;
  calculationModules: string[];
  requiresEngineeringReview: boolean;
  questions: AssistantQuestion[];
}
```

---

## 2. MATRIX TEMPLATE KATALOG (PHASE A - D)

### Phase A: Residential Buildings
1. `HOUSE-T36-1FL`: Rumah Type 36 1 Lantai (Pondasi Batu Kali, Sloof 15/20, Dinding Bata Ringan, Baja Ringan).
2. `HOUSE-T45-1FL`: Rumah Type 45 1 Lantai.
3. `HOUSE-T70-1FL`: Rumah Type 70 1 Lantai.
4. `HOUSE-T36-2FL`: Rumah Type 36 2 Lantai (Footplate + Kolom Praktis + Plat Lantai).
5. `CUSTOM_HOUSE`: Parameter Custom.

### Phase B: Roads & Drainage
1. `PAVING-BLOCK-STANDARD`: Paving K300 Tebal 6cm/8cm + Pasir Urug + Kanstin Beton.
2. `ASPHALT-ROAD-LIGHT`: Aspal Hotmix AC-WC + AC-BC + Base A + Base B.
3. `RIGID-CONCRETE-ROAD`: Jalan Beton K300 / FS45 + Wiremesh M8 + Plastik Cor.
4. `DRAIN-OPEN-TRAPEZOIDAL`: Saluran Pasangan Batu Kali / Precast U-Ditch.

### Phase C: Commercial & Water Resources
1. `HOTEL-MIDRISE`: Hotel Bertingkat Sedang (Struktur Portal Beton Bertulang).
2. `MULTIPURPOSE-HALL`: Gedung Serbaguna (Bentang Lebar Baja IWF).
3. `IRRIGATION-CANAL-CONCRETE`: Saluran Irigasi Lining Beton.
4. `EMBUNG-STANDARD`: Tampungan Air / Embung Pedesaan + Spillway Pelimpah.
5. `BRIDGE-GIRDER-STANDARD`: Jembatan Girder Beton 10m-25m.

### Phase D: Complex Engineering
1. `HOSPITAL-STANDARD`: Rumah Sakit Standar Permenkes.
2. `DAM-LARGE`: Bendungan Urugan / Gravitasi -> `ENGINEERING_REVIEW_REQUIRED`.
