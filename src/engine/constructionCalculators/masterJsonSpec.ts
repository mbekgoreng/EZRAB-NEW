// EZRAB Master Volume Calculator JSON Specification & Cell Formula Mapping
// Sourced from: EZRAB_VOLUME_CALCULATOR_MASTER.xlsx (SHA-256 recorded below)

export interface SheetFormulaMap {
  rows: number;
  columns: number;
  embedded_images: number;
  formulas: Record<string, string>;
}

export interface MasterWorkbookSpec {
  name: string;
  source_workbook: string;
  source_workbook_sha256: string;
  google_sheet_url: string;
  calculators: string[];
  sheets: Record<string, SheetFormulaMap>;
  production_engine_rules: {
    canonical_precision: string;
    rounding: string;
    invalid_input: string;
    unit_conversion: string;
    formula_execution: string;
    recommended_numeric_library: string;
    audit: string;
    dependency_chain: string;
  };
}

export const MASTER_VOLUME_CALCULATOR_SPEC: MasterWorkbookSpec = {
  name: "EZRAB Volume Calculator Master",
  source_workbook: "EZRAB_VOLUME_CALCULATOR_MASTER.xlsx",
  source_workbook_sha256: "BC350C1E9D7CF298FCD4C865A7A35F359C0BA71444647A593F98E37B239B7C28",
  google_sheet_url: "https://docs.google.com/spreadsheets/d/16AMdnxL7btK1AM1vsUyRxxNuouw9oZ3r/edit?gid=301436564#gid=301436564",
  calculators: [
    "Bowplank",
    "Pondasi",
    "Foot Plate",
    "Sloof",
    "Kolom",
    "Balok",
    "Bata Ringan",
    "Bata Merah",
    "Batako",
    "Pintu & Jendela",
    "Atap Baja Ringan",
    "Plesteran & Acian",
    "Penutup Lantai",
    "Penutup Dinding",
    "Plafon",
    "Pengecatan",
    "Kelistrikan",
    "Instalasi Air Bersih",
    "Sanitair"
  ],
  sheets: {
    "Bowplank": {
      rows: 79,
      columns: 19,
      embedded_images: 2,
      formulas: {
        "I9": "=IFERROR(D9*D10,0)",
        "O9": "=IFERROR(H44+H55,0)",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=IFERROR(2*(D9+D10+2*D11),0)",
        "O10": "=H45",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=(I10/D13+1)*(D12+0.3)*105%",
        "O11": "=H46",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=I10*105%",
        "O12": "=IFERROR(H47+H56,0)",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "I13": "=(0.5*D12*2)*(I10/D13)/2*105%",
        "R13": "=SUM(R9:R12)",
        "M15": "=C49",
        "O15": "=H49",
        "R15": "=IFERROR(Q15*O15,0)",
        "M16": "=C50",
        "O16": "=H50",
        "R16": "=IFERROR(Q16*O16,0)",
        "M17": "=C51",
        "O17": "=H51",
        "R17": "=IFERROR(Q17*O17,0)",
        "R18": "=SUM(R15:R17)",
        "R19": "=IFERROR(R13+R18,0)",
        "H44": "=IFERROR(I10*D44,0)",
        "H45": "=IFERROR(I10*D45,0)",
        "H46": "=IFERROR(I10*D46,0)",
        "H47": "=IFERROR(I10*D47,0)",
        "H49": "=IFERROR(0.0045*(I11+I13),0)",
        "H50": "=IFERROR(I12*D50,0)",
        "H51": "=IFERROR(I10*D51,0)",
        "H55": "=IFERROR(I9*D55,0)",
        "H56": "=IFERROR(I9*D56,0)"
      }
    },
    "Pondasi": {
      rows: 132,
      columns: 19,
      embedded_images: 2,
      formulas: {
        "I9": "=IF(D9=D10,SUM((D9*D11)*D12),SUM((D9+D10)/2)*D11*D12)",
        "O9": "=I71",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=IF(D14=D15,SUM((D14*D16)*D12),SUM((D14+D15)/2)*D16*D12)",
        "O10": "=I72",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=IFERROR(D12*D10*D17,0)",
        "O11": "=I73",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=IFERROR(D10*D18*D12,0)",
        "O12": "=I74",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "R13": "=SUM(R9:R12)",
        "I15": "=IFERROR(D22*D23*D20,0)",
        "O15": "=I12",
        "R15": "=IFERROR(Q15*O15,0)",
        "I16": "=IFERROR(D21*I9,0)",
        "O16": "=H116",
        "R16": "=IFERROR(Q16*O16,0)",
        "I17": "=I9",
        "O17": "=H76",
        "R17": "=IFERROR(Q17*O17,0)",
        "M19": "=C85",
        "O19": "=H85",
        "R19": "=IFERROR(Q19*O19,0)",
        "M20": "=C86",
        "O20": "=H86",
        "R20": "=IFERROR(Q20*O20,0)",
        "M21": "=C87",
        "O21": "=H87",
        "R21": "=IFERROR(Q21*O21,0)",
        "M23": "=C95",
        "O23": "=H95",
        "R23": "=IFERROR(Q23*O23,0)",
        "M24": "=C96",
        "O24": "=H96",
        "R24": "=IFERROR(Q24*O24,0)",
        "M25": "=C97",
        "O25": "=H97",
        "R25": "=IFERROR(Q25*O25,0)",
        "R26": "=IFERROR(R15+R16+R17+R19+R20+R21+R23+R24+R25,0)",
        "R27": "=IFERROR(R26+R13,0)",
        "H65": "=IFERROR(I9*D65,0)",
        "H66": "=IFERROR(I9*D66,0)",
        "H71": "=IFERROR(I11*D71,0)",
        "I71": "=IFERROR(H65+H71+H81+H91+H101+H106+H113,0)",
        "H72": "=IFERROR(I11*D72,0)",
        "I72": "=IFERROR(H72+H82+H92,0)",
        "H73": "=IFERROR(I11*D73,0)",
        "I73": "=IFERROR(D73,0)",
        "H74": "=IFERROR(I11*D74,0)",
        "I74": "=IFERROR(H66+H74+H83+H93+H102+H107+H114,0)",
        "H76": "=IFERROR(I11*D76,0)",
        "H77": "=IFERROR(I11*D77,0)",
        "H81": "=IFERROR((I10*D81)*L18,0)",
        "H82": "=IFERROR((I10*D82)*L18,0)",
        "H83": "=IFERROR((I10*D83)*L18,0)",
        "H85": "=IFERROR((I10*D85)*L18,0)",
        "H86": "=IFERROR((I10*D86/50)*L18,0)",
        "H87": "=IFERROR((I10*D87)*L18,0)",
        "H91": "=IFERROR((I10*D91)*L22,0)",
        "H92": "=IFERROR((I10*D92)*L22,0)",
        "H93": "=IFERROR((I10*D93)*L22,0)",
        "H95": "=IFERROR((I10*D95)*L22,0)",
        "H96": "=IFERROR((I10*D96/50)*L22,0)",
        "H97": "=IFERROR((I10*D97)*L22,0)",
        "H101": "=IFERROR(I17*D101,0)",
        "H102": "=IFERROR(I17*D102,0)",
        "H106": "=IFERROR(I12*D106,0)",
        "H107": "=IFERROR(I12*D107,0)",
        "H109": "=IFERROR(I12*D109,0)",
        "H113": "=IFERROR((I15+I16)*D113,0)",
        "H114": "=IFERROR((I15+I16)*D114,0)",
        "H116": "=IFERROR((I15+I16)*D116,0)"
      }
    },
    "Foot Plate": {
      rows: 119,
      columns: 19,
      embedded_images: 4,
      formulas: {
        "I8": "=IFERROR((D12+D14+D15+D8+10*D20/1000)*D25,0)",
        "I9": "=IFERROR((D12+D14+D15+D8+10*D21/1000)*D26,0)",
        "O9": "=I58",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=IFERROR(((D12+D14+D15)/D27+1)*(D8+D9+10*D22/1000-2*D34)*2,0)",
        "O10": "=I59",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=IFERROR((D10/D27+1)*(D11+2*10*D30/1000)+(D11/D27+1)*(D10+2*10*D30/1000),0)",
        "O11": "=I60",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=IFERROR((D10/D27+1)*(D11+2*D14+2*D15+2*10*D31/1000)+(D11/D27+1)*(D10+2*D14+2*D15+2*10*D31/1000),0)",
        "O12": "=I61",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "I13": "=IFERROR((D8+1.25*2*(D14+D15)+2*10*D32/1000)*4,0)",
        "R13": "=SUM(R9:R12)",
        "I14": "=IFERROR(((D12/D27+1)*(D25+D26)+(D10/D27+1)*(D11/D27+1))*(D28),0)",
        "M15": "=\"Besi utama, dia: \"&D20&\" mm\"",
        "O15": "=IFERROR(I24/12,0)",
        "R15": "=IFERROR(Q15*O15,0)",
        "I16": "=IFERROR(D10*D11*(D12+D14+D15+D16+D17)*D18*1,0)",
        "M16": "=\"Besi support, dia: \"&D21&\" mm\"",
        "O16": "=IFERROR(I25/12,0)",
        "R16": "=IFERROR(Q16*O16,0)",
        "I17": "=IFERROR(D10*D11*D17*D18*1,0)",
        "M17": "=\"Besi sengkang, dia: \"&D22&\" mm\"",
        "O17": "=IFERROR(I26/12,0)",
        "R17": "=IFERROR(Q17*O17,0)",
        "I18": "=IFERROR(0.785*D35/(10^6)*(I8*D20^2+I9*D21^2+I10*D22^2+I11*D30^2+I12*D31^2+I13*D32^2+I14*D23^2)*D18*1,0)",
        "M18": "=\"Besi alas, dia: \"&D30&\" mm\"",
        "O18": "=IFERROR(I27/12,0)",
        "R18": "=IFERROR(Q18*O18,0)",
        "I19": "=IFERROR(((D10+D11)*2*D15*D18+(D8+D9)*2*D12*D18)*1,0)",
        "M19": "=\"Besi pembentuk, dia: \"&D31&\" mm\"",
        "O19": "=IFERROR(I28/12,0)",
        "R19": "=IFERROR(Q19*O19,0)",
        "I20": "=IFERROR((D8*D9*D12+D10*D11*D15+D10*D11*D14*0.5)*D18*1,0)",
        "M20": "=\"Besi Kait, dia: \"&D32&\" mm\"",
        "O20": "=IFERROR(I29/12,0)",
        "R20": "=IFERROR(Q20*O20,0)",
        "I21": "=IFERROR(0.785*D35/(10^6)*(I14*D23^2)*D18*1,0)",
        "M21": "=\"Kawat Beton, \"&D23&\" mm\"",
        "O21": "=I21",
        "R21": "=IFERROR(Q21*O21,0)",
        "I22": "=IFERROR(D10*D11*D16*D18*1,0)",
        "O22": "=H84",
        "R22": "=IFERROR(Q22*O22,0)"
      }
    },
    "Sloof": {
      rows: 102,
      columns: 21,
      embedded_images: 2,
      formulas: {
        "I9": "=IFERROR((D9+(I14*2)+(I15*2))*D19,0)",
        "O9": "=I55",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=(D9+(I14*2)+(I15*2))*D20",
        "O10": "=I56",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=IFERROR(D25*(I16+I17),0)",
        "O11": "=I57",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=IFERROR(I31*I32,0)",
        "O12": "=I58",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "R13": "=SUM(R9:R12)",
        "I20": "=IFERROR((D9*D11*2)*D12,0)",
        "I21": "=IFERROR((D9*D10*D11)*D12,0)"
      }
    },
    "Kolom": {
      rows: 97,
      columns: 19,
      embedded_images: 2,
      formulas: {
        "I9": "=IFERROR((D9+I14+I15)*D19,0)",
        "O9": "=I55",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=IFERROR((D9+I14+I15)*D20,0)",
        "O10": "=I56",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=IFERROR(D25*I16,0)",
        "O11": "=I57",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=IFERROR((D19+D20)*(I16+1)*D26,0)",
        "O12": "=I58",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "R13": "=SUM(R9:R12)",
        "I20": "=IFERROR(((D10+D11)*D9*D12)*2,0)",
        "I21": "=IFERROR((D10*D11*D9)*D12,0)"
      }
    },
    "Balok": {
      rows: 106,
      columns: 20,
      embedded_images: 2,
      formulas: {
        "I9": "=IFERROR((D9+(I14*2)+(I15*2))*D19,0)",
        "O9": "=I55",
        "R9": "=IFERROR((Q9*O9)*L9,0)",
        "I10": "=(D9+(I14*2)+(I15*2))*D20",
        "O10": "=I56",
        "R10": "=IFERROR((Q10*O10)*L10,0)",
        "I11": "=IFERROR(D25*(I16+I17),0)",
        "O11": "=I57",
        "R11": "=IFERROR((Q11*O11)*L11,0)",
        "I12": "=IFERROR(I31*I32,0)",
        "O12": "=I58",
        "R12": "=IFERROR((Q12*O12)*L12,0)",
        "R13": "=SUM(R9:R12)",
        "I20": "=IFERROR((D9*D11*2)*D12,0)",
        "I21": "=IFERROR((D9*D10*D11)*D12,0)"
      }
    },
    "Bata Ringan": {
      rows: 88,
      columns: 18,
      embedded_images: 4,
      formulas: {
        "H23": "=IFERROR((((D9+D10)*D11)-H25)+H24,0)",
        "H24": "=IFERROR((0.5*H9*H10)*H11,0)",
        "H25": "=IFERROR(D13*D14*D15+H13*H14*H15+D17*D18*D19+H17+H18+H19,0)",
        "Q25": "=IFERROR(Q15+Q16+Q19+Q20+Q23+Q24,0)",
        "Q26": "=IFERROR(Q13+Q25,0)"
      }
    },
    "Bata Merah": {
      rows: 87,
      columns: 18,
      embedded_images: 4,
      formulas: {
        "H23": "=IFERROR((((D9+D10)*D11)-H25)+H24,0)",
        "H24": "=IFERROR((0.5*H9*H10)*H11,0)",
        "H25": "=IFERROR(D13*D14*D15+H13*H14*H15+D17*D18*D19+H17+H18+H19,0)",
        "Q26": "=IFERROR(Q15+Q16+Q17+Q19+Q20+Q21+Q23+Q24+Q25,0)",
        "Q27": "=IFERROR(Q13+Q26,0)"
      }
    },
    "Batako": {
      rows: 87,
      columns: 18,
      embedded_images: 4,
      formulas: {
        "H23": "=IFERROR((((D9+D10)*D11)-H25)+H24,0)",
        "H24": "=IFERROR((0.5*H9*H10)*H11,0)",
        "H25": "=IFERROR(D13*D14*D15+H13*H14*H15+D17*D18*D19+H17+H18+H19,0)",
        "Q25": "=IFERROR(Q15+Q16+Q17+Q18+Q21+Q22+Q23+Q24,0)",
        "Q26": "=IFERROR(Q13+Q25,0)"
      }
    },
    "Pintu & Jendela": {
      rows: 98,
      columns: 18,
      embedded_images: 4,
      formulas: {
        "H23": "=IFERROR(((((D10*2)+D9)*D11)+(H10*2)+H9)*H11,0)",
        "H24": "=Q38+Q39",
        "H25": "=IFERROR((D17*D18*D19)+H17*H18*H19,)",
        "H26": "=IFERROR(H23+H24,0)",
        "Q29": "=IFERROR(Q15+Q16+Q17+Q19+Q20+Q21+Q23+Q24+Q25+Q27+Q28,0)",
        "Q30": "=IFERROR(Q13+Q29,0)"
      }
    },
    "Atap Baja Ringan": {
      rows: 138,
      columns: 30,
      embedded_images: 3,
      formulas: {
        "I8": "=IFERROR(ATAN(D10/(0.5*D8))*180/PI(),0)",
        "I9": "=(D8/2)/COS(RADIANS(I8))",
        "I10": "=IFERROR((D12)/COS(RADIANS(I8)),0)",
        "I12": "=IFERROR(ROUNDUP(((I9+I10)/D15)+1,0)*2,0)",
        "I18": "=IFERROR(((I9+I10)*(D9+D13+D13))*2,0)",
        "I19": "=IFERROR(ROUNDUP(D9/D16+1,0),0)",
        "I21": "=I12*(D9+D13+D13)",
        "R26": "=SUM(R15:R25)",
        "R27": "=IFERROR(R13+R26,0)"
      }
    },
    "Plesteran & Acian": {
      rows: 94,
      columns: 18,
      embedded_images: 4,
      formulas: {
        "H23": "=IFERROR((((D9+D10)*D11)-H25)+H24,0)",
        "H24": "=IFERROR((0.5*H9*H10)*H11,0)",
        "H25": "=IFERROR(D13*D14*D15+H13*H14*H15+D17*D18*D19+H17+H18+H19,0)",
        "Q27": "=IFERROR(Q15+Q16+Q19+Q20+Q23+Q26,0)",
        "Q28": "=IFERROR(Q13+Q27,0)"
      }
    },
    "Penutup Lantai": {
      rows: 103,
      columns: 18,
      embedded_images: 2,
      formulas: {
        "H11": "=IFERROR((H9/100)*H10/100,0)",
        "D13": "=SUM(D9:D12)",
        "H15": "=IFERROR((H13/100)*H14/100,0)",
        "H23": "=D13",
        "Q34": "=IFERROR(Q15+Q16+Q17+Q18+Q20+Q21+Q22+Q23+Q25+Q26+Q27+Q28+Q30+Q31+Q32+Q33,0)",
        "Q35": "=IFERROR(Q13+Q34,0)"
      }
    },
    "Penutup Dinding": {
      rows: 88,
      columns: 18,
      embedded_images: 2,
      formulas: {
        "H11": "=IFERROR((H9/100)*H10/100,0)",
        "D13": "=SUM(D9:D12)",
        "H19": "=D13",
        "Q28": "=IFERROR(Q15+Q16+Q17+Q18+Q20+Q21+Q22+Q24+Q25+Q26+Q27,0)",
        "Q29": "=IFERROR(Q13+Q28,0)"
      }
    },
    "Plafon": {
      rows: 84,
      columns: 21,
      embedded_images: 3,
      formulas: {
        "J8": "=IFERROR(E8*E9,0)",
        "J9": "=+IFERROR((E8+E9)*2,0)",
        "J10": "=IFERROR(E8*E9,0)",
        "S63": "=IFERROR(S61+S47+S29+I83+I65+I47+I29,0)"
      }
    },
    "Pengecatan": {
      rows: 51,
      columns: 21,
      embedded_images: 4,
      formulas: {
        "E20": "=IFERROR(((((E8+E9)*E10)-J20)*1)+E21,0)",
        "J20": "=IFERROR(E12*E13*E14+J12*J13*J14+E16*E17*E18+J16+J17+J18,0)",
        "E21": "=IFERROR((0.5*J8*J9)*J10,0)",
        "J21": "=IFERROR((E8*E10*2)-J20,0)",
        "J22": "=IFERROR((E9*E10+E21)-J20,0)",
        "I51": "=IFERROR(I49+I36,0)"
      }
    },
    "Kelistrikan": {
      rows: 48,
      columns: 19,
      embedded_images: 2,
      formulas: {
        "J12": "=J8+(J9*2)+J10*3",
        "E16": "=IFERROR((E8+E9)*2*(2)*120%,0)",
        "E17": "=IFERROR((J11+J12+J14)*4*120%,0)",
        "I46": "=I27+I45",
        "I48": "=IFERROR(I46,0)"
      }
    },
    "Instalasi Air Bersih": {
      rows: 52,
      columns: 18,
      embedded_images: 2,
      formulas: {
        "E16": "=IFERROR((E8+2*E9+3*(E11+J11)),0)",
        "E17": "=IFERROR((E8+E9)*E15+10*J8,0)",
        "I50": "=IFERROR(I27+I38+I43+I49,0)",
        "I52": "=IFERROR(I50,0)"
      }
    },
    "Sanitair": {
      rows: 72,
      columns: 20,
      embedded_images: 2,
      formulas: {
        "E14": "=IFERROR(E8*120%,0)",
        "E15": "=IFERROR(E9*120%,0)",
        "I71": "=SUM(I69:J70)",
        "S71": "=IFERROR(I30+I44+I58+I72+S51+S69,0)",
        "I72": "=IFERROR(I67+I71,0)"
      }
    },
    "Rekap RAB": {
      rows: 32,
      columns: 9,
      embedded_images: 0,
      formulas: {
        "G11": "=Bowplank!R19",
        "G12": "=Pondasi!R27",
        "G13": "='Foot Plate'!R35",
        "G14": "=Sloof!R27",
        "G15": "=Kolom!R29",
        "G16": "=Balok!R29",
        "G17": "='Bata Ringan'!Q26",
        "G18": "='Bata Merah'!Q27",
        "G19": "=Batako!Q26",
        "G20": "='Pintu & Jendela'!Q30",
        "G21": "='Atap Baja Ringan'!R27",
        "G22": "='Plesteran & Acian'!Q28",
        "G23": "='Penutup Lantai'!Q35",
        "G24": "='Penutup Dinding'!Q29",
        "G25": "=Plafon!S63",
        "G26": "=Pengecatan!I51",
        "G27": "=Kelistrikan!I48",
        "G28": "='Instalasi Air Bersih'!I52",
        "G29": "=Sanitair!S71",
        "G30": "=SUM(G11:G29)"
      }
    }
  },
  production_engine_rules: {
    canonical_precision: "minimum 6 decimal places internally",
    rounding: "display/export only unless formula explicitly requires rounding",
    invalid_input: "reject with validation error; never coerce to zero",
    unit_conversion: "explicit and centralized",
    formula_execution: "deterministic calculation engine, not LLM arithmetic",
    recommended_numeric_library: "decimal.js or equivalent arbitrary-precision decimal arithmetic",
    audit: "store formula_id, inputs snapshot, output, unit, source calculator, timestamp",
    dependency_chain: "Volume Calculator -> QTO -> RAB -> AHSP -> Price -> BOQ/Rekap -> Kurva S -> Laporan"
  }
};

export function getSheetSpecByName(sheetName: string): SheetFormulaMap | undefined {
  return MASTER_VOLUME_CALCULATOR_SPEC.sheets[sheetName];
}
