import openpyxl
import re

EXCEL_PATH = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\ahsp bina kontruksi 2026.xlsx"
wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)
analysis_sheets = [s for s in wb.sheetnames if s not in ["Daftar Harga Satuan Pekerjaan", "Upah Bahan"]]

print(f"Total analysis sheets: {len(analysis_sheets)}")

all_found_items = []

for sname in analysis_sheets:
    ws = wb[sname]
    rows = list(ws.iter_rows(values_only=True))
    sheet_items = []
    
    for r_idx, r in enumerate(rows):
        c2 = str(r[2]).strip() if len(r) > 2 and r[2] is not None else ""
        # Check if this row is a table header row (Col C == 'No' or Col D contains 'Uraian')
        c3 = str(r[3]).strip().lower() if len(r) > 3 and r[3] is not None else ""
        if c2.lower() == 'no' or (c2 == '' and 'uraian' in c3):
            # Look backwards up to 5 rows to find the item code and description
            item_code = None
            item_desc = None
            code_row_idx = None
            
            for b in range(1, 6):
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
                sheet_items.append((item_code, item_desc, r_idx, code_row_idx))
            else:
                # If Col C had no code, check Col B or Col D
                pass
                
    all_found_items.extend([(sname, item) for item in sheet_items])
    print(f"Sheet '{sname}': found {len(sheet_items)} items")

print(f"\nTotal items found across all sheets: {len(all_found_items)}")
unique_codes = set(item[1][0] for item in all_found_items)
print(f"Unique codes: {len(unique_codes)}")

# Check if 1.1.1.1 is now found
persiapan_items = [it[1] for it in all_found_items if it[0] == 'Persiapan']
print("First 10 items in Persiapan:")
for it in persiapan_items[:10]:
    print(f"  {it[0]}: {it[1][:60]}")
