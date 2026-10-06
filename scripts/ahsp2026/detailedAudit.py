import json
import re
import os

print("--- 1. Checking indonesianAHSP.ts ---")
with open('src/data/indonesianAHSP.ts', 'r', encoding='utf-8') as f:
    indo_txt = f.read()

indo_items = re.findall(r'id:\s*[\'"]([^\'"]+)[\'"]', indo_txt)
print(f"Total items in indonesianAHSP.ts: {len(indo_items)}")

print("\n--- 2. Checking ahsp2026Canonical.generated.ts ---")
with open('src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts', 'r', encoding='utf-8') as f:
    canon_txt = f.read()

canon_codes = re.findall(r'code:\s*[\'"]([^\'"]+)[\'"]', canon_txt)
print(f"Total codes in ahsp2026Canonical.generated.ts: {len(canon_codes)}")

print("\n--- 3. Checking Excel Extraction vs Master ---")
# Let's inspect why there are discrepancies in Excel extraction
with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)

ck_items = [it for it in master['items'] if it.get('field') == 'CIPTA_KARYA']
print(f"Total Cipta Karya items in master: {len(ck_items)}")

# How many CK items have empty components (labor, materials, equipment all empty)?
empty_components = [it for it in ck_items if not it.get('components', {}).get('materials') and not it.get('components', {}).get('labor') and not it.get('components', {}).get('equipment')]
print(f"CK items with completely empty components: {len(empty_components)}")

# How many CK items have empty materials?
empty_materials = [it for it in ck_items if not it.get('components', {}).get('materials')]
print(f"CK items with 0 materials: {len(empty_materials)}")

# How many CK items have empty labor?
empty_labor = [it for it in ck_items if not it.get('components', {}).get('labor')]
print(f"CK items with 0 labor: {len(empty_labor)}")

# How many CK items have empty unit?
empty_unit = [it for it in ck_items if not it.get('unit')]
print(f"CK items with empty unit: {len(empty_unit)}")

# How many CK items have description starting with 'DAFTAR ISI' or suspicious?
suspicious_desc = [it for it in ck_items if 'DAFTAR ISI' in it.get('description', '') or len(it.get('description', '')) < 5]
print(f"CK items with suspicious description: {len(suspicious_desc)}")

# Let's see some samples of 0 materials
print("\nSample items with 0 materials (first 10):")
for it in empty_materials[:10]:
    comps = it.get('components', {})
    print(f"  {it['code']} [{it.get('unit')}] labor:{len(comps.get('labor', []))} eq:{len(comps.get('equipment', []))} - {it['description'][:60]}")

# Let's see some samples of 0 labor
print("\nSample items with 0 labor (first 10):")
for it in empty_labor[:10]:
    comps = it.get('components', {})
    print(f"  {it['code']} [{it.get('unit')}] mat:{len(comps.get('materials', []))} eq:{len(comps.get('equipment', []))} - {it['description'][:60]}")

