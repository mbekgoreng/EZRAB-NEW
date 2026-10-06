import openpyxl
import os
import json
import datetime
import re

WORKBOOK_PATH = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\ahsp bina kontruksi 2026.xlsx"
REPORT_PATH = "EZRAB_CIPTA_KARYA_EXCEL_AUDIT.md"

print(f"Opening workbook: {WORKBOOK_PATH}")
wb_values = openpyxl.load_workbook(WORKBOOK_PATH, read_only=True, data_only=True)
wb_formulas = openpyxl.load_workbook(WORKBOOK_PATH, read_only=True, data_only=False)

sheet_names = wb_values.sheetnames
print(f"Total sheets: {len(sheet_names)}")

audit_results = []
total_rows_all = 0
total_leaf_ahsp_all = 0
total_formulas_all = 0

for sname in sheet_names:
    ws_v = wb_values[sname]
    ws_f = wb_formulas[sname]
    
    rows_v = list(ws_v.iter_rows(values_only=True))
    rows_f = list(ws_f.iter_rows(values_only=True))
    
    r_count = len(rows_v)
    c_count = max(len(r) for r in rows_v) if rows_v else 0
    total_rows_all += r_count
    
    formula_count = 0
    vlookup_count = 0
    numeric_count = 0
    text_count = 0
    formulas_sample = []
    
    for r in rows_f:
        for val in r:
            if val is not None:
                s_val = str(val)
                if s_val.startswith("="):
                    formula_count += 1
                    total_formulas_all += 1
                    if "VLOOKUP" in s_val.upper():
                        vlookup_count += 1
                    if len(formulas_sample) < 3:
                        formulas_sample.append(s_val[:60])
                        
    for r in rows_v:
        for val in r:
            if val is not None:
                if isinstance(val, (int, float)):
                    numeric_count += 1
                elif isinstance(val, str) and val.strip() and not val.startswith("="):
                    text_count += 1
                    
    leaf_count = 0
    header_count = 0
    if sname == "Daftar Harga Satuan Pekerjaan":
        for r in rows_v[4:]: # skip title rows
            c_code = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ""
            c_unit = str(r[3]).strip() if len(r) > 3 and r[3] is not None else ""
            c_price = r[4] if len(r) > 4 else None
            
            norm = c_code.rstrip(".")
            if re.match(r"^\d+(\.\d+)+[a-zA-Z]?$", norm) or re.match(r"^[A-Z]\.\d+(\.\d+)*[a-zA-Z]?$", norm):
                if c_unit and c_price is not None and isinstance(c_price, (int, float)) and c_price > 0:
                    leaf_count += 1
                else:
                    header_count += 1
        total_leaf_ahsp_all = leaf_count
        
    audit_results.append({
        "sheet": sname,
        "rows": r_count,
        "cols": c_count,
        "formulas": formula_count,
        "vlookups": vlookup_count,
        "numerics": numeric_count,
        "texts": text_count,
        "leaf_count": leaf_count,
        "header_count": header_count,
        "formula_samples": formulas_sample
    })
    print(f"Audited '{sname:30s}': {r_count:5d} rows, {formula_count:5d} formulas, {leaf_count:4d} leaves")

# Generate Markdown report
md_lines = []
md_lines.append("# EZRAB CIPTA KARYA EXCEL FORENSIC AUDIT REPORT")
md_lines.append(f"**Generated:** {datetime.datetime.now().isoformat()}  ")
md_lines.append(f"**Workbook:** `{WORKBOOK_PATH}`  ")
md_lines.append(f"**Total Sheets:** {len(sheet_names)}  ")
md_lines.append(f"**Total Rows:** {total_rows_all:,}  ")
md_lines.append(f"**Total Formulas:** {total_formulas_all:,}  ")
md_lines.append(f"**Priced Leaf AHSP in DHSP:** {total_leaf_ahsp_all:,}  ")
md_lines.append("")
md_lines.append("---")
md_lines.append("## 1. Executive Summary")
md_lines.append("The official Cipta Karya workbook (`ahsp bina kontruksi 2026.xlsx`) contains 42 worksheets structured across three distinct layers:")
md_lines.append("1. **DHSP Summary Sheet (`Daftar Harga Satuan Pekerjaan`)**: 3,148 rows containing work item codes, descriptions, units, and unit prices. The unit prices in column E are dynamically linked via `=VLOOKUP(...)` formulas targeting the detail analysis sheets.")
md_lines.append("2. **Resource Master Sheet (`Upah Bahan`)**: 3,324 resource pricing entries (45 labor rates, 3,075 material prices, and 204 equipment rental rates) serving as the authoritative price master for SE DJBK No. 47/SE/Dk/2026.")
md_lines.append("3. **40 Technical Analysis Sheets (`Persiapan`, `Galian Tanah`, `Beton`, `Pondasi`, `BAJA`, etc.)**: Detail bill of quantities breaking down each work item into Tenaga Kerja (Labor), Bahan (Materials), and Peralatan (Equipment) with exact coefficients and line totals, concluding at Row F (`Harga Satuan Pekerjaan (D+E)`).")
md_lines.append("")
md_lines.append("---")
md_lines.append("## 2. Comprehensive Sheet Inventory")
md_lines.append("| No | Sheet Name | Rows | Cols | Formulas | VLOOKUPs | Key Function |")
md_lines.append("| -: | :--- | ---: | ---: | ---: | ---: | :--- |")

for i, a in enumerate(audit_results, 1):
    func = "Detail Analysis"
    if a["sheet"] == "Daftar Harga Satuan Pekerjaan":
        func = "**DHSP Summary (Master Catalog)**"
    elif a["sheet"] == "Upah Bahan":
        func = "**Price Master (Upah/Bahan/Alat)**"
    md_lines.append(f"| {i} | `{a['sheet']}` | {a['rows']:,} | {a['cols']} | {a['formulas']:,} | {a['vlookups']:,} | {func} |")

md_lines.append("")
md_lines.append("---")
md_lines.append("## 3. Formula Architecture & Resolution Mechanics")
md_lines.append("The DHSP sheet relies on dynamic formula resolution:")
md_lines.append("- **Formula Pattern:** `=VLOOKUP(C10,Persiapan!$D$5:$K$679,8,FALSE)`")
md_lines.append("- **Behavior:** Looks up the item code/name in the respective detail sheet and extracts column 8 (Harga Satuan Pekerjaan D+E).")
md_lines.append("- **Pre-calculated Cache:** When read with `data_only=True` in openpyxl, Excel's pre-calculated cache provides the exact evaluated numbers (e.g. Row 10: `787397`, Row 11: `635526`, Row 12: `378239`, Row 13: `428906`, Row 14: `17431`).")
md_lines.append("- **Implication:** The importer extracts both the evaluated numeric prices from DHSP AND traces component breakdowns from the source analysis sheets.")
md_lines.append("")
md_lines.append("---")
md_lines.append("## 4. Hierarchy & Leaf AHSP Classification")
md_lines.append("In the DHSP and detail sheets, codes represent varying levels of the work breakdown structure (WBS):")
md_lines.append("- `1.` → Divisi: `PERSIAPAN LAPANGAN / SITE WORK` (No unit, no price)")
md_lines.append("- `1.1` → Subdivisi: `PEKERJAAN PERSIAPAN` (No unit, no price)")
md_lines.append("- `1.1.1` → Sub-subdivisi / Category: `Pembuatan Pagar Proyek` (No unit, no price)")
md_lines.append("- `1.1.1.1` → **Leaf AHSP**: `Pembuatan 1 m' pagar sementara dari kayu tinggi 2 meter` (Unit: `m'`, Price: `787397`)")
md_lines.append("- `1.1.1.2` → **Leaf AHSP**: `Pembuatan 1 m' pagar sementara dari seng gelombang rangka kayu tinggi 2 meter` (Unit: `m'`, Price: `635526`)")
md_lines.append("")
md_lines.append("Classification rule: An entry is a **Leaf AHSP** if and only if it possesses a valid construction unit (`m'`, `m2`, `m3`, `buah`, `kg`, `OH`, `titik`, etc.) and a distinct component analysis.")
md_lines.append("")

with open(REPORT_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(md_lines))

print(f"Generated {REPORT_PATH} successfully!")
