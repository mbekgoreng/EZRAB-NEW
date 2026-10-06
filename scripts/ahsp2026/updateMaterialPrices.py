import json
import re
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

UB_PATH = os.path.join("data", "ahsp2026", "excel_extracted", "upah_bahan.json")
INDON_PRICES_PATH = os.path.join("src", "data", "indonesianPrices.ts")
MASTER_MAT_PATH = os.path.join("src", "data", "masterMaterials2026.json")

with open(UB_PATH, "r", encoding="utf-8") as f:
    ub = json.load(f)

# Normalize string key
def norm_k(s):
    s = s.lower()
    s = re.sub(r"[\(\)\,\-\_\/]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

ub_map = {}
for m in ub["materials"]:
    k = norm_k(m["name"])
    ub_map[k] = m["price"]

# -----------------------------------------------------------------------------
# 1. Update src/data/indonesianPrices.ts
# -----------------------------------------------------------------------------
print("Updating src/data/indonesianPrices.ts...")
with open(INDON_PRICES_PATH, "r", encoding="utf-8") as f:
    indon_text = f.read()

# Exact price replacements for known common materials matching Upah Bahan
price_updates = {
    "BB-001": 700,      # Bata Merah Bakar Standar -> 700
    "BB-002": 700,      # Bata Merah Ekspose -> 700
    "BB-003": 703500,   # Bata Ringan AAC t=10cm -> 703,500
    "BB-009": 152000,   # Batu Candi Hitam Magelang -> 152,000
    "SM-002": 89700,    # Semen Putih 40 kg -> 89,700
    "BJ-007": 16480,    # Baja Profil IWF / WF -> 16,480
    "BJ-009": 11522,    # Wiremesh M6 -> 11,522 (kg/unit)
    "BJ-010": 12049,    # Wiremesh M8 -> 12,049
    "CT-001": 25000,    # Cat Dinding Interior -> 25,000
    "CT-002": 25000,    # Cat Dinding Eksterior -> 25,000
    "CT-003": 50000,    # Cat Kayu & Besi -> 50,000
    "CT-004": 30000,    # Cat Epoxy Lantai -> 30,000
    "SN-002": 325100,   # Wastafel Gantung -> 325,100
    "SN-003": 666000,   # Kran Shower Set -> 666,000
    "EL-002": 70000,    # Stop Kontak -> 70,000
    "FS-001": 225800,   # ACP Aluminium Composite Panel -> 225,800
    "WP-001": 61200,    # Waterproofing -> 61,200
    "WP-002": 33500,    # Polyurethane Sealant -> 33,500
    "LS-001": 10000,    # Rumput Gajah Mini -> 10,000
}

updated_indon_count = 0
for item_id, new_price in price_updates.items():
    # Regex to find the item block by ID and update price, minPrice, maxPrice
    pattern = rf"(id:\s*['\"]{item_id}['\"][^}}]+?price:\s*)\d+([^}}]+?minPrice:\s*)\d+([^}}]+?maxPrice:\s*)\d+"
    min_p = round(new_price * 0.95)
    max_p = round(new_price * 1.15)
    
    def repl(match, np=new_price, mip=min_p, mapx=max_p):
        return f"{match.group(1)}{np}{match.group(2)}{mip}{match.group(3)}{mapx}"
        
    new_text, n = re.subn(pattern, repl, indon_text)
    if n > 0:
        indon_text = new_text
        updated_indon_count += n

with open(INDON_PRICES_PATH, "w", encoding="utf-8") as f:
    f.write(indon_text)

print(f"Updated {updated_indon_count} items in src/data/indonesianPrices.ts with SE 47/2026 prices.")

# -----------------------------------------------------------------------------
# 2. Update and enrich src/data/masterMaterials2026.json
# -----------------------------------------------------------------------------
print("Updating src/data/masterMaterials2026.json...")
with open(MASTER_MAT_PATH, "r", encoding="utf-8") as f:
    master_materials = json.load(f)

existing_names = set(norm_k(m.get("name", "")) for m in master_materials)

updated_mat_count = 0
for m in master_materials:
    name = m.get("name", "")
    k = norm_k(name)
    matched_price = None
    if k in ub_map:
        matched_price = ub_map[k]
    elif "—" in name:
        base = norm_k(name.split("—")[0])
        if base in ub_map:
            matched_price = ub_map[base]
            
    if matched_price is not None:
        m["price"] = matched_price
        m["minPrice"] = round(matched_price * 0.95)
        m["maxPrice"] = round(matched_price * 1.15)
        m["lastUpdated"] = "2026-09-28"
        m["priceSource"] = "SE Bina Konstruksi No. 47/SE/Dk/2026 Cipta Karya"
        updated_mat_count += 1

# Append non-duplicate Cipta Karya materials from Upah Bahan
next_id_num = len(master_materials) + 1
appended_count = 0

for m in ub["materials"]:
    k = norm_k(m["name"])
    if k not in existing_names:
        existing_names.add(k)
        mat_id = f"MAT-CK-{str(next_id_num).zfill(5)}"
        p = m["price"]
        new_entry = {
            "id": mat_id,
            "code": mat_id,
            "name": m["name"].strip(),
            "category": "CIPTA_KARYA",
            "subcategory": "Bahan Bangunan & Infrastruktur",
            "brand": "Standar Nasional",
            "specification": f"Bahan Standar SE Bina Konstruksi No. 47/SE/Dk/2026 ({m.get('unit', '').strip()})",
            "unit": m.get("unit", "").strip() or "unit",
            "price": p,
            "minPrice": round(p * 0.95),
            "maxPrice": round(p * 1.15),
            "location": "Nasional",
            "supplier": "Distributor Terdaftar",
            "periodVersion": "2026",
            "lastUpdated": "2026-09-28",
            "priceSource": "SE Bina Konstruksi No. 47/SE/Dk/2026 Cipta Karya"
        }
        master_materials.append(new_entry)
        next_id_num += 1
        appended_count += 1

with open(MASTER_MAT_PATH, "w", encoding="utf-8") as f:
    json.dump(master_materials, f, indent=2, ensure_ascii=False)

print(f"masterMaterials2026.json updated: {updated_mat_count} existing prices updated, {appended_count} new Cipta Karya materials appended. Total materials now: {len(master_materials)}")
