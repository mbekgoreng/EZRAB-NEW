import openpyxl
import re
import os
import json

WORKBOOK_PATH = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\AHSP 2026 Bina Marga.xlsx"
PRICES_OUT_TS = os.path.join("src", "data", "nationalCostDatabase", "officialBinaMargaPrices2026.ts")
DHSP_OUT_TS = os.path.join("src", "data", "nationalCostDatabase", "officialBinaMargaDhsp2026.ts")

print("1. Loading Workbook for Bina Marga DHSP & Price Generation...")
wb = openpyxl.load_workbook(WORKBOOK_PATH, data_only=False)

# -------------------------------------------------------------
# Part 1: Extract Price Master from 'Upah Bahan'
# -------------------------------------------------------------
ws_ub = wb['Upah Bahan']
rows_ub = list(ws_ub.iter_rows(values_only=True))

labor_entries = []
material_entries = []
equipment_entries = []

current_cat = None
upahbahan_dict = {}
upahbahan_code_dict = {}

for r_idx, r in enumerate(rows_ub, start=1):
    txt = " ".join([str(x) for x in r if x is not None])
    if "I.  UPAH / TENAGA KERJA" in txt:
        current_cat = 'labor'
        continue
    elif "II.  MATERIAL / BAHAN" in txt:
        current_cat = 'material'
        continue
    elif "III.  ALAT / PERALATAN" in txt:
        current_cat = 'equipment'
        continue

    # Col D: No, Col E: Kode, Col F: UPAH-MATERIAL-ALAT, Col G: SATUAN, Col H: HARGA SATUAN
    if len(r) > 7 and r[7] is not None and isinstance(r[7], (int, float)):
        code = str(r[4] or '').strip()
        name = str(r[5] or '').strip()
        unit = str(r[6] or '').strip()
        price = float(r[7])
        
        entry = {
            "code": code,
            "name": name,
            "unit": unit,
            "price": price,
            "category": current_cat or 'material',
            "sourceSheet": "Upah Bahan",
            "sourceRow": r_idx
        }
        
        if name:
            upahbahan_dict[name.lower()] = price
        if code:
            upahbahan_code_dict[code.lower()] = price
            
        if current_cat == 'labor':
            labor_entries.append(entry)
        elif current_cat == 'equipment':
            equipment_entries.append(entry)
        else:
            material_entries.append(entry)

print(f"Extracted from 'Upah Bahan': {len(labor_entries)} labor, {len(material_entries)} materials, {len(equipment_entries)} equipment")

# -------------------------------------------------------------
# Part 2: Extract Detailed AHSP Blocks from Sheets A-J
# -------------------------------------------------------------
cat_sheets = [
    'A - Umum dan Penerapan SMKK',
    'B - Drainase',
    'C - Tanah dan Geosintetik',
    'D - Preventif',
    'E - Perkerasan Berbutir dan Per',
    'F - Perkerasan Aspal',
    'G - Struktur',
    'H - Rehabilitasi Jembatan',
    'I - Harian dan Pekerjaan Lain-l',
    'J - Pemeliharaan'
]

dhsp_items = []
extra_inline_prices = {}

for sname in cat_sheets:
    ws = wb[sname]
    s_prefix = sname[0]
    
    block_rows = []
    for r in range(1, ws.max_row + 1):
        c = str(ws.cell(r, 3).value or '').strip()
        if re.match(rf"^{s_prefix}\.\d+$", c):
            block_rows.append(r)
            
    for b_idx, start_r in enumerate(block_rows):
        end_r = block_rows[b_idx + 1] - 1 if b_idx + 1 < len(block_rows) else ws.max_row
        
        tag = str(ws.cell(start_r, 3).value or '').strip()
        name = str(ws.cell(start_r, 4).value or '').strip()
        unit = str(ws.cell(start_r, 6).value or '').strip()
        code = str(ws.cell(start_r, 13).value or '').strip()
        
        sub_tenaga = 0.0
        sub_bahan = 0.0
        sub_alat = 0.0
        has_analisa = False
        current_section = None
        
        labor_comps = []
        material_comps = []
        equipment_comps = []
        
        for r in range(start_r + 1, end_r + 1):
            c_val = str(ws.cell(r, 3).value or '').strip()
            d_val = str(ws.cell(r, 4).value or '').strip()
            e_val = str(ws.cell(r, 5).value or '').strip()
            f_val = str(ws.cell(r, 6).value or '').strip()
            g_val = ws.cell(r, 7).value
            h_val = ws.cell(r, 8).value
            
            if c_val == 'A' and 'TENAGA' in d_val.upper():
                current_section = 'labor'
                has_analisa = True
                continue
            elif c_val == 'B' and 'BAHAN' in d_val.upper():
                current_section = 'material'
                has_analisa = True
                continue
            elif c_val == 'C' and 'PERALATAN' in d_val.upper():
                current_section = 'equipment'
                has_analisa = True
                continue
            elif 'JUMLAH HARGA' in c_val.upper() or 'JUMLAH HARGA' in d_val.upper():
                continue
            elif c_val in ['D', 'E', 'F'] and ('JUMLAH' in d_val.upper() or 'BIAYA UMUM' in d_val.upper() or 'HARGA SATUAN' in d_val.upper()):
                current_section = None
                continue
                
            if current_section and d_val and g_val is not None:
                try:
                    coef = float(g_val)
                except:
                    coef = 0.0
                    
                price = None
                if h_val is not None and isinstance(h_val, (int, float)):
                    price = float(h_val)
                    if d_val and price > 0:
                        extra_inline_prices[d_val.lower()] = {
                            "code": e_val,
                            "name": d_val,
                            "unit": f_val,
                            "price": price,
                            "category": current_section,
                            "sourceSheet": sname,
                            "sourceRow": r
                        }
                else:
                    price = upahbahan_dict.get(d_val.lower())
                    if price is None and e_val:
                        price = upahbahan_code_dict.get(e_val.lower())
                        
                subtotal = (coef * price) if price is not None else 0.0
                
                comp = {
                    'code': e_val,
                    'name': d_val,
                    'unit': f_val,
                    'coefficient': coef,
                    'unitPrice': price,
                    'subtotal': subtotal
                }
                
                if current_section == 'labor':
                    labor_comps.append(comp)
                    sub_tenaga += subtotal
                elif current_section == 'material':
                    material_comps.append(comp)
                    sub_bahan += subtotal
                elif current_section == 'equipment':
                    equipment_comps.append(comp)
                    sub_alat += subtotal

        if has_analisa and (labor_comps or material_comps or equipment_comps):
            d_total = sub_tenaga + sub_bahan + sub_alat
            e_overhead = d_total * 0.10
            f_hsp = d_total + e_overhead
            k_price = int(f_hsp)
        else:
            d_total = 0.0
            e_overhead = 0.0
            f_hsp = 0.0
            k_price = None

        clean_c = re.sub(r'[^\w\.]', '', code.lower()).strip('.')
        dhsp_items.append({
            "code": code or tag,
            "rawCode": code,
            "cleanCode": clean_c,
            "tag": tag,
            "name": name,
            "unit": unit,
            "unitPrice": k_price,
            "directCost": round(d_total, 2) if d_total > 0 else None,
            "overheadAmount": round(e_overhead, 2) if e_overhead > 0 else None,
            "laborSubtotal": round(sub_tenaga, 2) if sub_tenaga > 0 else None,
            "materialSubtotal": round(sub_bahan, 2) if sub_bahan > 0 else None,
            "equipmentSubtotal": round(sub_alat, 2) if sub_alat > 0 else None,
            "laborComponents": labor_comps,
            "materialComponents": material_comps,
            "equipmentComponents": equipment_comps,
            "isLeaf": True,
            "hasAnalisa": has_analisa,
            "sourceSheet": sname,
            "sourceRow": start_r
        })

print(f"Total DHSP items extracted: {len(dhsp_items)}")
print(f"Extra inline prices found: {len(extra_inline_prices)}")

# Add any extra inline prices to material or equipment entries if not already present
for k, v in extra_inline_prices.items():
    if v['category'] == 'equipment':
        if not any(e['name'].lower() == k for e in equipment_entries):
            equipment_entries.append(v)
    elif v['category'] == 'material':
        if not any(m['name'].lower() == k for m in material_entries):
            material_entries.append(v)

# -------------------------------------------------------------
# Part 3: Write officialBinaMargaPrices2026.ts
# -------------------------------------------------------------
lines_prices = []
lines_prices.append("/**")
lines_prices.append(" * DAFTAR HARGA SATUAN UPAH, BAHAN, DAN PERALATAN BINA MARGA 2026")
lines_prices.append(" * Sourced directly from SE Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026 (Lampiran V)")
lines_prices.append(" * Evaluated from sheet 'Upah Bahan' and inline special rates with complete provenance")
lines_prices.append(" */")
lines_prices.append("")
lines_prices.append("export interface BinaMargaPriceEntry {")
lines_prices.append("  code: string;")
lines_prices.append("  name: string;")
lines_prices.append("  unit: string;")
lines_prices.append("  price: number;")
lines_prices.append("  category: 'labor' | 'material' | 'equipment';")
lines_prices.append("  sourceSheet: string;")
lines_prices.append("  sourceRow: number;")
lines_prices.append("}")
lines_prices.append("")
lines_prices.append(f"export const OFFICIAL_BM_2026_LABOR: BinaMargaPriceEntry[] = {json.dumps(labor_entries, indent=2, ensure_ascii=False)};")
lines_prices.append("")
lines_prices.append(f"export const OFFICIAL_BM_2026_MATERIALS: BinaMargaPriceEntry[] = {json.dumps(material_entries, indent=2, ensure_ascii=False)};")
lines_prices.append("")
lines_prices.append(f"export const OFFICIAL_BM_2026_EQUIPMENT: BinaMargaPriceEntry[] = {json.dumps(equipment_entries, indent=2, ensure_ascii=False)};")
lines_prices.append("")

with open(PRICES_OUT_TS, "w", encoding="utf-8") as f:
    f.write("\n".join(lines_prices))
print(f"Generated {PRICES_OUT_TS}")

# -------------------------------------------------------------
# Part 4: Write officialBinaMargaDhsp2026.ts
# -------------------------------------------------------------
lines_dhsp = []
lines_dhsp.append("/**")
lines_dhsp.append(" * OFFICIAL BINA MARGA DHSP 2026 (DAFTAR HARGA SATUAN PEKERJAAN)")
lines_dhsp.append(" * Sourced directly from SE DJBK No. 47/SE/Dk/2026 Lampiran V (Workbook: AHSP 2026 Bina Marga.xlsx)")
lines_dhsp.append(" * Evaluated from category sheets A through J with formula traceability and component breakdown")
lines_dhsp.append(" */")
lines_dhsp.append("")
lines_dhsp.append("export interface BinaMargaComponentEntry {")
lines_dhsp.append("  code: string;")
lines_dhsp.append("  name: string;")
lines_dhsp.append("  unit: string;")
lines_dhsp.append("  coefficient: number;")
lines_dhsp.append("  unitPrice: number | null;")
lines_dhsp.append("  subtotal: number;")
lines_dhsp.append("}")
lines_dhsp.append("")
lines_dhsp.append("export interface OfficialBinaMargaDhspEntry {")
lines_dhsp.append("  code: string;")
lines_dhsp.append("  rawCode: string;")
lines_dhsp.append("  cleanCode: string;")
lines_dhsp.append("  tag: string;")
lines_dhsp.append("  name: string;")
lines_dhsp.append("  unit: string;")
lines_dhsp.append("  unitPrice: number | null;")
lines_dhsp.append("  directCost: number | null;")
lines_dhsp.append("  overheadAmount: number | null;")
lines_dhsp.append("  laborSubtotal: number | null;")
lines_dhsp.append("  materialSubtotal: number | null;")
lines_dhsp.append("  equipmentSubtotal: number | null;")
lines_dhsp.append("  laborComponents: BinaMargaComponentEntry[];")
lines_dhsp.append("  materialComponents: BinaMargaComponentEntry[];")
lines_dhsp.append("  equipmentComponents: BinaMargaComponentEntry[];")
lines_dhsp.append("  isLeaf: boolean;")
lines_dhsp.append("  hasAnalisa: boolean;")
lines_dhsp.append("  sourceSheet: string;")
lines_dhsp.append("  sourceRow: number;")
lines_dhsp.append("}")
lines_dhsp.append("")

# Chunk entries to prevent TS deep recursion
chunk_size = 150
chunks = []
for i in range(0, len(dhsp_items), chunk_size):
    cname = f"__BM_DHSP_CHUNK_{i // chunk_size}"
    s_json = json.dumps(dhsp_items[i:i+chunk_size], indent=2, ensure_ascii=False)
    lines_dhsp.append(f"const {cname}: OfficialBinaMargaDhspEntry[] = {s_json};")
    chunks.append(cname)
    lines_dhsp.append("")

lines_dhsp.append("export const OFFICIAL_BM_2026_DHSP_LIST: OfficialBinaMargaDhspEntry[] = [")
for cn in chunks:
    lines_dhsp.append(f"  ...{cn},")
lines_dhsp.append("];")
lines_dhsp.append("")
lines_dhsp.append("export const OFFICIAL_BM_2026_DHSP_MAP = new Map<string, OfficialBinaMargaDhspEntry>();")
lines_dhsp.append("")
lines_dhsp.append("for (const entry of OFFICIAL_BM_2026_DHSP_LIST) {")
lines_dhsp.append("  if (entry.code) {")
lines_dhsp.append("    OFFICIAL_BM_2026_DHSP_MAP.set(entry.code, entry);")
lines_dhsp.append("  }")
lines_dhsp.append("  if (entry.rawCode && entry.rawCode !== entry.code) {")
lines_dhsp.append("    OFFICIAL_BM_2026_DHSP_MAP.set(entry.rawCode, entry);")
lines_dhsp.append("  }")
lines_dhsp.append("  if (entry.cleanCode) {")
lines_dhsp.append("    OFFICIAL_BM_2026_DHSP_MAP.set(entry.cleanCode, entry);")
lines_dhsp.append("  }")
lines_dhsp.append("  if (entry.tag) {")
lines_dhsp.append("    OFFICIAL_BM_2026_DHSP_MAP.set(entry.tag, entry);")
lines_dhsp.append("  }")
lines_dhsp.append("}")
lines_dhsp.append("")
lines_dhsp.append(f"export const BM_2026_DHSP_TOTAL_COUNT = {len(dhsp_items)};")
lines_dhsp.append(f"export const BM_2026_DHSP_PRICED_COUNT = {len([x for x in dhsp_items if x['unitPrice'] is not None])};")
lines_dhsp.append("")

with open(DHSP_OUT_TS, "w", encoding="utf-8") as f:
    f.write("\n".join(lines_dhsp))
print(f"Generated {DHSP_OUT_TS}")
