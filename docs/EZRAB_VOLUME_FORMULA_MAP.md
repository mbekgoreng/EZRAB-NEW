# EZRAB_VOLUME_FORMULA_MAP.md — Formula Extraction & Parity Map

Dokumentasi komprehensif pemetaan parameter input, sel formula Excel, formula turunan, dan pembulatan untuk seluruh 19 kalkulator volume master EZRAB.

---

## 01 — Bowplank (BOWPLANK)

- **Primary Output**: Panjang Bowplank (m¹)
- **Excel Sheet**: Bowplank

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I9 | =IFERROR(D9*D10,0) | None |  |
| O9 | =IFERROR(H44+H55,0) | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =IFERROR(2*(D9+D10+2*D11),0) | None |  |
| O10 | =H45 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| I11 | =(I10/D13+1)*(D12+0.3)*105% | None |  |
| O11 | =H46 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |
| I12 | =I10*105% | None |  |
| O12 | =IFERROR(H47+H56,0) | None | Mandor |
| R12 | =IFERROR((Q12*O12)*L12,0) | None | 200000 |

---

## 02 — Pondasi (PONDASI)

- **Primary Output**: Volume Pondasi Batu Kali (m³)
- **Excel Sheet**: Pondasi

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I9 | =IF(D9=D10,SUM((D9*D11)*D12),SUM((D9+D10)/2)*D11*D12) | None | Volume galian |
| O9 | =I71 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =IF(D14=D15,SUM((D14*D16)*D12),SUM((D14+D15)/2)*D16*D12) | None | Volume pondasi |
| O10 | =I72 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| I11 | =IFERROR(D12*D10*D17,0) | None | Pas. Aanstamping |
| O11 | =I73 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |
| I12 | =IFERROR(D10*D18*D12,0) | None | Pasir uruk |
| O12 | =I74 | None | Mandor |
| R12 | =IFERROR((Q12*O12)*L12,0) | None | 200000 |

---

## 03 — Foot Plate (FOOT_PLATE)

- **Primary Output**: Volume Beton Foot Plate (m³)
- **Excel Sheet**: Foot Plate

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I8 | =IFERROR((D12+D14+D15+D8+10*D20/1000)*D25,0) | None | Jumlah Besi D1 |
| I9 | =IFERROR((D12+D14+D15+D8+10*D21/1000)*D26,0) | None | Jumlah Besi D2 |
| O9 | =I58 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =IFERROR(((D12+D14+D15)/D27+1)*(D8+D9+10*D22/1000-2*D34)*2,0) | None | Jumlah Besi D3 |
| O10 | =I59 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| I11 | =IFERROR((D10/D27+1)*(D11+2*10*D30/1000)+(D11/D27+1)*(D10+2*10*D30/1000),0) | None | Jumlah Besi D4 |
| O11 | =I60 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |
| I12 | =IFERROR((D10/D27+1)*(D11+2*D14+2*D15+2*10*D31/1000)+(D11/D27+1)*(D10+2*D14+2*D15+2*10*D31/1000),0) | None | Jumlah Besi D5 |
| O12 | =I61 | None | Mandor |

---

## 04 — Sloof (SLOOF)

- **Primary Output**: Volume Beton Sloof (m³)
- **Excel Sheet**: Sloof

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I9 | =IFERROR((D9+(I14*2)+(I15*2))*D19,0) | None | Besi tulangan 1 |
| O9 | =I55 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =(D9+(I14*2)+(I15*2))*D20 | None | Besi tulangan 2 |
| O10 | =I56 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| I11 | =IFERROR(D25*(I16+I17),0) | None | Besi sengkang/ring |
| O11 | =I57 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |
| I12 | =IFERROR(I31*I32,0) | None | Kawat beton |
| O12 | =I58 | None | Mandor |
| R12 | =IFERROR((Q12*O12)*L12,0) | None | 200000 |

---

## 05 — Kolom (KOLOM)

- **Primary Output**: Volume Beton Kolom (m³)
- **Excel Sheet**: Kolom

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I9 | =IFERROR((D9+I14+I15)*D19,0) | None | Besi utama |
| O9 | =I55 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 80000 |
| I10 | =IFERROR((D9+I14+I15)*D20,0) | None | Besi support |
| O10 | =I56 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 135000 |
| I11 | =IFERROR(D25*I16,0) | None | Besi sengkang/ring |
| O11 | =I57 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 150000 |
| I12 | =IFERROR((D19+D20)*(I16+1)*D26,0) | None | Kawat beton |
| O12 | =I58 | None | Mandor |
| R12 | =IFERROR((Q12*O12)*L12,0) | None | 175000 |

---

## 06 — Balok (BALOK)

- **Primary Output**: Volume Beton Balok (m³)
- **Excel Sheet**: Balok

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| I9 | =IFERROR((D9+(I14*2)+(I15*2))*D19,0) | None | Besi tulangan 1 |
| O9 | =I55 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =(D9+(I14*2)+(I15*2))*D20 | None | Besi tulangan 2 |
| O10 | =I56 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| I11 | =IFERROR(D25*(I16+I17),0) | None | Besi sengkang/ring |
| O11 | =I57 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |
| I12 | =IFERROR(I31*I32,0) | None | Kawat beton |
| O12 | =I58 | None | Mandor |
| R12 | =IFERROR((Q12*O12)*L12,0) | None | 200000 |

---

## 07 — Bata Ringan (BATA_RINGAN)

- **Primary Output**: Luas Pasangan Bata Ringan (m²)
- **Excel Sheet**: Bata Ringan

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H56 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H57 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| N11 | =H58 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H59 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| Q13 | =SUM(Q9:Q12) | None |  |
| L15 | =C61 | None |  |
| N15 | =G61 | None | =C61 |
| Q15 | =IFERROR(P15*N15,0) | None | 8500 |

---

## 08 — Bata Merah (BATA_MERAH)

- **Primary Output**: Luas Pasangan Bata Merah (m²)
- **Excel Sheet**: Bata Merah

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H56 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H57 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| N11 | =H58 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H59 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| Q13 | =SUM(Q9:Q12) | None |  |
| L15 | =C61 | None |  |
| N15 | =G61 | None | =C61 |
| Q15 | =IFERROR(P15*N15,0) | None | 700 |

---

## 09 — Batako (BATAKO)

- **Primary Output**: Luas Pasangan Batako (m²)
- **Excel Sheet**: Batako

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H56 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H57 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| N11 | =H58 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H59 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| Q13 | =SUM(Q9:Q12) | None |  |
| L15 | =C61 | None |  |
| N15 | =G61 | None | =C61 |
| Q15 | =IFERROR(P15*N15,0) | None | 3000 |

---

## 10 — Pintu & Jendela (PINTU_JENDELA)

- **Primary Output**: Luas Kusen Pintu & Jendela (m²)
- **Excel Sheet**: Pintu & Jendela

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H56 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H57 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| N11 | =H58 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H59 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| Q13 | =SUM(Q9:Q12) | None |  |
| L15 | =C61 | None |  |
| N15 | =G61 | None | =C61 |
| Q15 | =IFERROR(P15*N15,0) | None | 25000000 |

---

## 11 — Atap Baja Ringan (ATAP_BAJA_RINGAN)

- **Primary Output**: Luas Rangka Atap (m²)
- **Excel Sheet**: Atap Baja Ringan

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| U6 | =I9+I10 | None |  |
| U7 | =D13+D9+D13 | None |  |
| I8 | =IFERROR(ATAN(D10/(0.5*D8))*180/PI(),0) | None | Kemiringan atap |
| U8 | =I9+I10 | None |  |
| I9 | =(D8/2)/COS(RADIANS(I8)) | None | Panjang sisi miring |
| O9 | =I56 | None | Pekerja |
| R9 | =IFERROR((Q9*O9)*L9,0) | None | 100000 |
| I10 | =IFERROR((D12)/COS(RADIANS(I8)),0) | None | Panjang miring overstek |
| O10 | =I57 | None | Tukang |
| R10 | =IFERROR((Q10*O10)*L10,0) | None | 145000 |
| O11 | =I58 | None | Kepala Tukang |
| R11 | =IFERROR((Q11*O11)*L11,0) | None | 175000 |

---

## 12 — Plesteran & Acian (PLESTERAN_ACIAN)

- **Primary Output**: Luas Plesteran & Acian (m²)
- **Excel Sheet**: Plesteran & Acian

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H57 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H58 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| N11 | =H59 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H60 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| Q13 | =SUM(Q9:Q12) | None |  |
| L15 | =C62 | None |  |
| N15 | =G62/50 | None | =C62 |
| Q15 | =IFERROR(P15*N15,0) | None | 65000 |

---

## 13 — Penutup Lantai (PENUTUP_LANTAI)

- **Primary Output**: Luas Penutup Lantai Granit/Keramik (m²)
- **Excel Sheet**: Penutup Lantai

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H56 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H57 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| H11 | =IFERROR((H9/100)*H10/100,0) | None | LUAS GRANIT |
| N11 | =H58 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H59 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| D13 | =SUM(D9:D12) | None | LUAS LANTAI |
| Q13 | =SUM(Q9:Q12) | None |  |
| H15 | =IFERROR((H13/100)*H14/100,0) | None | LUAS MARMER |

---

## 14 — Penutup Dinding (PENUTUP_DINDING)

- **Primary Output**: Luas Penutup Dinding Keramik (m²)
- **Excel Sheet**: Penutup Dinding

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| N9 | =H55 | None | Pekerja |
| Q9 | =IFERROR((P9*N9)*K9,0) | None | 100000 |
| N10 | =H56 | None | Tukang |
| Q10 | =IFERROR((P10*N10)*K10,0) | None | 145000 |
| H11 | =IFERROR((H9/100)*H10/100,0) | None | LUAS HOMOGENEOUS |
| N11 | =H57 | None | Kepala Tukang |
| Q11 | =IFERROR((P11*N11)*K11,0) | None | 175000 |
| N12 | =H58 | None | Mandor |
| Q12 | =IFERROR((P12*N12)*K12,0) | None | 200000 |
| D13 | =SUM(D9:D12) | None | TOTAL LUAS DINDING |
| Q13 | =SUM(Q9:Q12) | None |  |
| H15 | =IFERROR((H13/100)*H14/100,0) | None | LUAS PORSELEN |

---

## 15 — Plafon (PLAFON)

- **Primary Output**: Luas Plafon Gypsum/Kalsiboard (m²)
- **Excel Sheet**: Plafon

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| D5 | ="Pemasangan Plafon "&J8& " m²" | None |  |
| J6 | =E8+E9 | None | Volume |
| J8 | =IFERROR(E8*E9,0) | None |  |
| J9 | =+IFERROR((E8+E9)*2,0) | None |  |
| J10 | =IFERROR(E8*E9,0) | None |  |
| E16 | =IFERROR((J8*0.255),0) | None | Pekerja |
| I16 | =((G16*E16*B16)) | None | 100000 |
| O16 | =IFERROR((J8*0.405),0) | None | Pekerja |
| S16 | =((Q16*O16*L16)) | None | 100000 |
| E17 | =((J8*0.395)) | None | Tukang |
| I17 | =((G17*E17*B17)) | None | 145000 |
| O17 | =((J8*0.445)) | None | Tukang |

---

## 16 — Pengecatan (PENGECATAN)

- **Primary Output**: Luas Pengecatan Dinding (m²)
- **Excel Sheet**: Pengecatan

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| D5 | ="Pengecatan Dinding "&J21+J22& " m²" | None |  |
| J6 | =E8+E9 | None |  |
| E20 | =IFERROR(((((E8+E9)*E10)-J20)*1)+E21,0) | None | Luas Pasangan Dinding |
| J20 | =IFERROR(E12*E13*E14+J12*J13*J14+E16*E17*E18+J16+J17+J18,0) | None |  |
| E21 | =IFERROR((0.5*J8*J9)*J10,0) | None | Luas Ampig |
| J21 | =IFERROR((E8*E10*2)-J20,0) | None |  |
| J22 | =IFERROR((E9*E10+E21)-J20,0) | None |  |
| T22 | =IFERROR((E8+E9)*E10,0) | None |  |
| T23 | =IFERROR((T22*2)+E21,0) | None |  |
| E27 | =IFERROR((J21*0.0667),0) | None | Pekerja |
| I27 | =((G27*E27*B27)) | None | 100000 |
| E28 | =((J21*0.0667)) | None | Tukang |

---

## 17 — Kelistrikan (KELISTRIKAN)

- **Primary Output**: Jumlah Titik Instalasi Listrik (titik)
- **Excel Sheet**: Kelistrikan

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| D5 | ="Pemasangan Instalasi Listrik "&E8*E9& " m²" | None |  |
| J6 | =E8+E9 | None |  |
| N9 | =E17*0.024 | None |  |
| O9 | =E16*0.024 | None | =E17*0.024 |
| P9 | =E10*1.076 | None | =E16*0.024 |
| Q9 | =E15*0.105 | None | =E10*1.076 |
| R9 | =J12*0.064 | None | =E15*0.105 |
| N10 | =E17*0.04 | None |  |
| O10 | =E16*0.04 | None | =E17*0.04 |
| P10 | =E10*1.797 | None | =E16*0.04 |
| Q10 | =E15*0.175 | None | =E10*1.797 |
| R10 | =J12*0.107 | None | =E15*0.175 |

---

## 18 — Instalasi Air Bersih (AIR_BERSIH)

- **Primary Output**: Panjang Pipa Air Bersih (m¹)
- **Excel Sheet**: Instalasi Air Bersih

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| D5 | ="Pemasangan Instalasi Air Bersih "&E8*E9& " m²" | None |  |
| J6 | =E8+E9 | None |  |
| M8 | =J11*1 | None | unit |
| N8 | =J9*0.625 | None | =J11*1 |
| O8 | =E16*0.017 | None | =J9*0.625 |
| P8 | =E17*0.024 | None | =E16*0.017 |
| Q8 | =E10*0.079 | None | =E17*0.024 |
| R8 | =((M8+N8+O8+P8+Q8)) | None | =E10*0.079 |
| M9 | =J11*0.5 | None | unit |
| N9 | =J9*1.044 | None | =J11*0.5 |
| O9 | =E16*0.028 | None | =J9*1.044 |
| P9 | =E17*0.04 | None | =E16*0.028 |

---

## 19 — Sanitair (SANITAIR)

- **Primary Output**: Jumlah Unit Sanitair (unit)
- **Excel Sheet**: Sanitair

### Formulas & Calculations

| Excel Cell | Formula | Cached Example Value | Context / Label |
|---|---|---|---|
| J6 | =E8+E9 | None |  |
| E14 | =IFERROR(E8*120%,0) | None | Pipa Limbah 3" |
| E15 | =IFERROR(E9*120%,0) | None | Pipa Kloset 4" |
| E21 | =IFERROR(E10*0.5,0) | None | Pekerja |
| I21 | =((G21*E21*B21)) | None | 100000 |
| E22 | =IFERROR(E10*1.2,0) | None | Tukang |
| I22 | =((G22*E22*B22)) | None | 145000 |
| E23 | =IFERROR(E10*0.12,0) | None | Kepala Tukang |
| I23 | =((G23*E23*B23)) | None | 175000 |
| E24 | =IFERROR(E10*0.04,0) | None | Mandor |
| I24 | =((G24*E24*B24)) | None | 200000 |
| I25 | =SUM(I21:J24) | None |  |

---

## 20 — Baja WF (BAJA_WF) [PROPOSED / SEPARATELY SOURCED]

- **Status**: PROPOSED / SEPARATELY SOURCED (Standard SNI 07-7178-2006 / Gunung Garuda)
- **Primary Output**: Total Berat Baja WF (kg / ton)
- **Theoretical Cross-Section Area**:
  A = 2 \times b_f \times t_f + (h - 2 \times t_f) \times t_w \quad (\text{mm}^2)
  \text{Nominal kg/m} = A \times 0.00785
- **Length & Weight Formulas**:
  \text{totalLength} = L \times \text{jumlahBatang} \quad (\text{m})
  \text{baseWeight} = \text{totalLength} \times \text{kgPerM} \quad (\text{kg})
  \text{wasteWeight} = \text{baseWeight} \times \frac{\text{wastePercent}}{100} \quad (\text{kg})
  \text{profileWeight} = \text{baseWeight} + \text{wasteWeight} \quad (\text{kg})
  \text{totalSteelWeight} = \text{profileWeight} + \text{plateWeight} + \text{boltWeight} + \text{weldingAllowance} \quad (\text{kg})
  \text{totalTon} = \frac{\text{totalSteelWeight}}{1000} \quad (\text{ton})
