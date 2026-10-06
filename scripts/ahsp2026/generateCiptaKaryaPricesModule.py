import json
import os
import re

with open("data/ahsp2026/excel_extracted/upah_bahan.json", "r", encoding="utf-8") as f:
    ub = json.load(f)

def is_clean(entry):
    name = entry.get('name', '').strip()
    price = entry.get('price', 0)
    if not name or name in ["1", "2", "3", "4", "5", "6", "7", "8", "9"]:
        return False
    if name.lower() in ["uraian", "satuan", "harga", "jumlah"]:
        return False
    if not isinstance(price, (int, float)) or price <= 0:
        return False
    return True

clean_labor = [e for e in ub['labor'] if is_clean(e)]
clean_materials = [e for e in ub['materials'] if is_clean(e)]
clean_equipment = [e for e in ub['equipment'] if is_clean(e)]

lines = []
lines.append("/**")
lines.append(" * DAFTAR HARGA SATUAN UPAH, BAHAN, DAN PERALATAN 2026")
lines.append(" * Sourced directly from SE Bina Konstruksi No. 47/SE/Dk/2026 Cipta Karya Workbook")
lines.append(" * Generated from Sheet Upah Bahan")
lines.append(" */")
lines.append("")
lines.append("export interface CiptaKaryaPriceEntry {")
lines.append("  code: string;")
lines.append("  name: string;")
lines.append("  unit: string;")
lines.append("  price: number;")
lines.append("}")
lines.append("")

labor_json = json.dumps(clean_labor, indent=2, ensure_ascii=False)
lines.append(f"export const OFFICIAL_CK_2026_LABOR: CiptaKaryaPriceEntry[] = {labor_json};")
lines.append("")

# Chunk materials to avoid TS compiler complexity
chunk_size = 200
mat_chunks = []
for i in range(0, len(clean_materials), chunk_size):
    chunk_name = f"__CK_MAT_CHUNK_{i // chunk_size}"
    slice_data = clean_materials[i:i+chunk_size]
    slice_json = json.dumps(slice_data, indent=2, ensure_ascii=False)
    lines.append(f"const {chunk_name}: CiptaKaryaPriceEntry[] = {slice_json};")
    mat_chunks.append(chunk_name)
    lines.append("")

lines.append("export const OFFICIAL_CK_2026_MATERIALS: CiptaKaryaPriceEntry[] = [")
for cn in mat_chunks:
    lines.append(f"  ...{cn},")
lines.append("];")
lines.append("")

equip_json = json.dumps(clean_equipment, indent=2, ensure_ascii=False)
lines.append(f"export const OFFICIAL_CK_2026_EQUIPMENT: CiptaKaryaPriceEntry[] = {equip_json};")
lines.append("")

lines.append(f"export const CK_2026_TOTAL_LABOR_COUNT = {len(clean_labor)};")
lines.append(f"export const CK_2026_TOTAL_MATERIAL_COUNT = {len(clean_materials)};")
lines.append(f"export const CK_2026_TOTAL_EQUIPMENT_COUNT = {len(clean_equipment)};")
lines.append("")

out_file = os.path.join("src", "data", "nationalCostDatabase", "officialCiptaKaryaPrices2026.ts")
with open(out_file, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Generated {out_file} with {len(clean_materials)} materials, {len(clean_labor)} labor, {len(clean_equipment)} equipment.")
