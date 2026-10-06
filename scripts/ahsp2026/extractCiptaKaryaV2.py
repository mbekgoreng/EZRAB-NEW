import openpyxl
import re
import sys
import io
import json
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

EXCEL_PATH = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\ahsp bina kontruksi 2026.xlsx"

print("Loading workbook:", EXCEL_PATH)
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

# -------------------------------------------------------------
# 1. Extract Upah Bahan
# -------------------------------------------------------------
print("Extracting Upah Bahan...")
ws_upah_bahan = wb['Upah Bahan']
rows_ub = list(ws_upah_bahan.iter_rows(values_only=True))

ub_labor = []
ub_materials = []
ub_equipment = []

curr_ub_section = None
for r_idx, r in enumerate(rows_ub):
    col3 = str(r[3]).strip() if len(r) > 3 and r[3] is not None else ""
    col5 = str(r[5]).strip() if len(r) > 5 and r[5] is not None else ""
    
    if col3 == "I." or "UPAH" in col5:
        curr_ub_section = "labor"
        continue
    elif col3 == "II." or "MATERIAL" in col5:
        curr_ub_section = "materials"
        continue
    elif col3 in ["III", "III."] or "SEWA PERALATAN" in col5 or "PERALATAN" in col5:
        curr_ub_section = "equipment"
        continue
        
    kode = str(r[4] or "").strip() if len(r) > 4 else ""
    name = str(r[5] or "").strip() if len(r) > 5 else ""
    unit = str(r[6] or "").strip() if len(r) > 6 else ""
    price_val = r[7] if len(r) > 7 else None
    
    if not name or price_val is None or not isinstance(price_val, (int, float)) or price_val <= 0:
        continue
    if name.upper() in ["UPAH", "MATERIAL", "SEWA PERALATAN", "UPAH - MATERIAL - ALAT"]:
        continue
        
    entry = {
        "code": kode,
        "name": name,
        "unit": unit,
        "price": float(price_val)
    }
    
    if curr_ub_section == "labor":
        ub_labor.append(entry)
    elif curr_ub_section == "materials":
        ub_materials.append(entry)
    elif curr_ub_section == "equipment":
        ub_equipment.append(entry)

print(f"Upah Bahan: labor={len(ub_labor)}, materials={len(ub_materials)}, equipment={len(ub_equipment)}")

# -------------------------------------------------------------
# 2. Extract DHSP
# -------------------------------------------------------------
print("Extracting DHSP...")
ws_dhsp = wb['Daftar Harga Satuan Pekerjaan']
dhsp_items = {}
for row in ws_dhsp.iter_rows(values_only=True):
    col1 = str(row[1]).strip() if len(row) > 1 and row[1] is not None else ""
    norm = col1.rstrip(".")
    if re.match(r"^\d+(\.\d+)+[a-zA-Z]?$", norm) or re.match(r"^[A-Z]\.\d+(\.\d+)*[a-zA-Z]?$", norm):
        name = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
        unit = str(row[3]).strip() if len(row) > 3 and row[3] is not None else ""
        price = row[4] if len(row) > 4 and isinstance(row[4], (int, float)) else 0
        dhsp_items[norm] = {
            "code": norm,
            "raw_code": col1,
            "name": name,
            "unit": unit,
            "price": float(price)
        }

print(f"DHSP: {len(dhsp_items)} items")

# -------------------------------------------------------------
# 3. Extract Analysis Sheets using Backward-Lookup from Table Header
# -------------------------------------------------------------
print("Extracting Analysis Sheets...")
analysis_sheets = [s for s in wb.sheetnames if s not in ["Daftar Harga Satuan Pekerjaan", "Upah Bahan"]]
parsed_analyses = {}

for sname in analysis_sheets:
    ws = wb[sname]
    rows = list(ws.iter_rows(values_only=True))
    
    # First find all table header rows ("No" in col C or col B/D)
    table_headers = []
    for r_idx, r in enumerate(rows):
        c2 = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""
        c3 = str(r[3]).strip().lower() if len(r) > 3 and r[3] is not None else ""
        if c2.lower() == 'no' or (c2 == '' and 'uraian' in c3):
            # Look backwards up to 6 rows to find the closest code row
            item_code = None
            item_desc = None
            code_row_idx = None
            for b in range(1, 7):
                if r_idx - b >= 0:
                    prev_r = rows[r_idx - b]
                    prev_c2 = str(prev_r[2]).strip() if len(prev_r) > 2 and prev_r[2] is not None else ""
                    norm = prev_c2.rstrip(".")
                    if re.match(r"^\d+(\.\d+)+[a-zA-Z]?$", norm) or re.match(r"^[A-Z]\.\d+(\.\d+)*[a-zA-Z]?$", norm):
                        item_code = norm
                        item_desc = str(prev_r[3]).strip() if len(prev_r) > 3 and prev_r[3] is not None else ""
                        code_row_idx = r_idx - b
                        break
            if item_code:
                table_headers.append({
                    "code": item_code,
                    "desc": item_desc,
                    "header_row_idx": r_idx,
                    "code_row_idx": code_row_idx
                })

    # Now for each table header, parse until the next item's code row or next table header
    for i, th in enumerate(table_headers):
        code = th["code"]
        desc = th["desc"]
        h_idx = th["header_row_idx"]
        next_boundary = table_headers[i + 1]["code_row_idx"] if i + 1 < len(table_headers) else len(rows)
        
        header_row = rows[h_idx]
        col_map = {}
        for c_i, c_val in enumerate(header_row):
            if c_val is None: continue
            c_str = str(c_val).strip().lower()
            if "uraian" in c_str: col_map["name"] = c_i
            elif "kode" in c_str: col_map["code"] = c_i
            elif "jumlah" in c_str: col_map["total"] = c_i
            elif "harga" in c_str: col_map["price"] = c_i
            elif "koef" in c_str: col_map["coeff"] = c_i
            elif "sat" in c_str: col_map["unit"] = c_i
            
        item_data = {
            "code": code,
            "raw_code": code,
            "description": desc,
            "unit": dhsp_items.get(code, {}).get("unit", ""),
            "unit_price": dhsp_items.get(code, {}).get("price", 0.0),
            "labor": [],
            "materials": [],
            "equipment": [],
            "sheet": sname
        }
        
        curr_cat = None
        cur_r = h_idx + 1
        
        while cur_r < next_boundary:
            row_data = rows[cur_r]
            rc2 = str(row_data[2]).strip() if len(row_data) > 2 and row_data[2] is not None else ""
            rc3 = str(row_data[3]).strip() if len(row_data) > 3 and row_data[3] is not None else ""
            
            # Check if we hit the next item's code row
            if re.match(r"^\d+(\.\d+)+[a-zA-Z]?$", rc2.rstrip(".")) or re.match(r"^[A-Z]\.\d+(\.\d+)*[a-zA-Z]?$", rc2.rstrip(".")):
                break

            # Check for category transitions
            if rc2 == "A" or "tenaga" in rc3.lower():
                curr_cat = "labor"
                cur_r += 1
                continue
            elif rc2 == "B" or "bahan" in rc3.lower():
                curr_cat = "materials"
                cur_r += 1
                continue
            elif rc2 == "C" or "peralatan" in rc3.lower() or "alat" in rc3.lower():
                curr_cat = "equipment"
                cur_r += 1
                continue
            elif rc2 in ["D", "E", "F"] or "jumlah (a+b+c)" in rc3.lower() or "biaya umum" in rc3.lower() or "harga satuan pekerjaan" in rc3.lower():
                if rc2 == "F" or "harga satuan pekerjaan" in rc3.lower():
                    if not item_data["unit_price"]:
                        for val in row_data[4:]:
                            if isinstance(val, (int, float)) and val > 0:
                                item_data["unit_price"] = float(val)
                                break
                    cur_r += 1
                    break
                cur_r += 1
                continue
                
            # If line is summary or blank
            if "jumlah harga" in rc2.lower() or "jumlah harga" in rc3.lower():
                cur_r += 1
                continue
                
            if not rc2 and not rc3:
                cur_r += 1
                continue
                
            # Parse component
            if curr_cat and (re.match(r"^\d+$", rc2) or (rc3 and not rc2.startswith("JUMLAH"))):
                comp_name = str(row_data[col_map.get("name", 3)] or "").strip()
                comp_code = str(row_data[col_map["code"]] or "").strip() if "code" in col_map and len(row_data) > col_map["code"] else ""
                comp_unit = str(row_data[col_map["unit"]] or "").strip() if "unit" in col_map and len(row_data) > col_map["unit"] else ""
                comp_coeff = row_data[col_map["coeff"]] if "coeff" in col_map and len(row_data) > col_map["coeff"] else 0
                comp_price = row_data[col_map["price"]] if "price" in col_map and len(row_data) > col_map["price"] else 0
                comp_total = row_data[col_map["total"]] if "total" in col_map and len(row_data) > col_map["total"] else 0
                
                # Verify that it is a valid component (has name, not a header/total, and has either positive coeff or price)
                if comp_name and comp_name != "Uraian" and not comp_name.startswith("JUMLAH") and (comp_coeff != 0 or comp_unit):
                    item_data[curr_cat].append({
                        "code": comp_code,
                        "name": comp_name,
                        "unit": comp_unit,
                        "coefficient": float(comp_coeff) if isinstance(comp_coeff, (int, float)) else 0.0,
                        "unitPrice": float(comp_price) if isinstance(comp_price, (int, float)) else 0.0,
                        "total": float(comp_total) if isinstance(comp_total, (int, float)) else 0.0
                    })
                    
            cur_r += 1
            
        parsed_analyses[code] = item_data

print(f"Total analyses parsed with backward lookup: {len(parsed_analyses)}")

out_dir = os.path.join(os.getcwd(), "data", "ahsp2026", "excel_extracted")
os.makedirs(out_dir, exist_ok=True)

with open(os.path.join(out_dir, "cipta_karya_analyses.json"), "w", encoding="utf-8") as f:
    json.dump(parsed_analyses, f, indent=2, ensure_ascii=False)

with open(os.path.join(out_dir, "dhsp_items.json"), "w", encoding="utf-8") as f:
    json.dump(dhsp_items, f, indent=2, ensure_ascii=False)

with open(os.path.join(out_dir, "upah_bahan.json"), "w", encoding="utf-8") as f:
    json.dump({
        "labor": ub_labor,
        "materials": ub_materials,
        "equipment": ub_equipment
    }, f, indent=2, ensure_ascii=False)

print("Extraction completed successfully!")
