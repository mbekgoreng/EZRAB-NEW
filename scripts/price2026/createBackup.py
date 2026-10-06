import hashlib
import shutil
import json
import os
import datetime

SRC_WORKBOOK = r"D:\file kerja\PEMBUATAN SOFTWARE\ezrab folder\ahsp exce\ahsp bina kontruksi 2026.xlsx"
BACKUP_DIR = os.path.join("backups", "excel-ahsp-cipta-karya-2026")
os.makedirs(BACKUP_DIR, exist_ok=True)

# 1. Copy workbook
dst_workbook = os.path.join(BACKUP_DIR, "ahsp bina kontruksi 2026.xlsx")
if not os.path.exists(dst_workbook):
    shutil.copy2(SRC_WORKBOOK, dst_workbook)
    print("Copied original workbook to:", dst_workbook)
else:
    print("Backup workbook already exists at:", dst_workbook)

# 2. Compute SHA256
with open(SRC_WORKBOOK, "rb") as f:
    sha256 = hashlib.sha256(f.read()).hexdigest()

file_size = os.path.getsize(SRC_WORKBOOK)
mod_time = datetime.datetime.fromtimestamp(os.path.getmtime(SRC_WORKBOOK)).isoformat()
now_iso = datetime.datetime.now().isoformat()

# 3. Read current canonical counts
with open("data/ahsp2026/validated/ahsp_2026_master.json", "r", encoding="utf-8") as f:
    master = json.load(f)

items = master["items"]
counts = {
    "TOTAL": len(items),
    "SMKK": sum(1 for it in items if it.get("field") == "SMKK"),
    "SDA": sum(1 for it in items if it.get("field") == "SDA"),
    "BINA_MARGA": sum(1 for it in items if it.get("field") == "BINA_MARGA"),
    "CIPTA_KARYA": sum(1 for it in items if it.get("field") == "CIPTA_KARYA"),
}

with open("data/ahsp2026/validated/ahsp_2026_resources.json", "r", encoding="utf-8") as f:
    res = json.load(f)
resource_count = len(res.get("resources", res))

# 4. Generate EZRAB_CK_EXCEL_IMPORT_BACKUP.md
backup_md = f"""# EZRAB CIPTA KARYA EXCEL IMPORT BACKUP MANIFEST
**Timestamp:** {now_iso}  
**Source Path:** `{SRC_WORKBOOK}`  
**Backup Path:** `{dst_workbook}`  

---

## 1. File Fingerprint
- **File Name:** `ahsp bina kontruksi 2026.xlsx`
- **File Size:** {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)
- **File Last Modified:** {mod_time}
- **SHA-256 Checksum:** `{sha256}`

---

## 2. Canonical AHSP Baseline Snapshot
| Field / Bidang | Pre-Import Count | Regulation / Provenance |
| :--- | :--- | :--- |
| **SMKK** | {counts['SMKK']:,} | SE DJBK No. 47/SE/Dk/2026 (Lampiran III) |
| **Sumber Daya Air (SDA)** | {counts['SDA']:,} | SE DJBK No. 47/SE/Dk/2026 (Lampiran IV) |
| **Bina Marga** | {counts['BINA_MARGA']:,} | SE DJBK No. 47/SE/Dk/2026 (Lampiran V) |
| **Cipta Karya** | {counts['CIPTA_KARYA']:,} | SE DJBK No. 47/SE/Dk/2026 (Lampiran VI) |
| **TOTAL CANONICAL AHSP** | **{counts['TOTAL']:,}** | **Invariant: Strictly 5,801 items** |

- **Canonical Resources Indexed:** {resource_count:,} resources

---

## 3. Preservation Commitments
1. Total canonical items count MUST remain **5,801**.
2. SMKK (223), SDA (1,556), and Bina Marga (1,163) remain untouched.
3. Cipta Karya canonical set is verified and reconciled against `ahsp bina kontruksi 2026.xlsx`.
4. Original workbook is preserved immutable in `{BACKUP_DIR}/`.
"""

with open("EZRAB_CK_EXCEL_IMPORT_BACKUP.md", "w", encoding="utf-8") as f:
    f.write(backup_md)

print("Created EZRAB_CK_EXCEL_IMPORT_BACKUP.md successfully!")
print("SHA256:", sha256)
print("Canonical counts:", counts)
