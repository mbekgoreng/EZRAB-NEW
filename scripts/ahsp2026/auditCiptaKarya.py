import json
import os

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master_data = json.load(f)

items = master_data['items']
ck_items = [it for it in items if it.get('field') == 'CIPTA_KARYA']
print(f"Total Cipta Karya items in master: {len(ck_items)}")

empty_comp = [it for it in ck_items if len(it.get('components', [])) == 0]
print(f"CK items with 0 components: {len(empty_comp)}")

statuses = {}
for it in ck_items:
    st = it.get('validation', {}).get('status', 'UNKNOWN')
    statuses[st] = statuses.get(st, 0) + 1
print(f"CK validation statuses: {statuses}")

zero_coef = []
empty_name = []
empty_unit = []
total_components = 0
for it in ck_items:
    comps = it.get('components', [])
    total_components += len(comps)
    for c in comps:
        if c.get('coefficient', 0) == 0:
            zero_coef.append((it['code'], c))
        if not c.get('name'):
            empty_name.append((it['code'], c))
        if not c.get('unit'):
            empty_unit.append((it['code'], c))

print(f"Total CK components: {total_components}")
print(f"CK components with zero coefficient: {len(zero_coef)}")
print(f"CK components with empty name: {len(empty_name)}")
print(f"CK components with empty unit: {len(empty_unit)}")

if empty_comp:
    print(f"\n--- CK items with 0 components ({len(empty_comp)}) ---")
    for it in empty_comp[:25]:
        val = it.get('validation', {})
        print(f"  [{it.get('code')}] {it.get('description', '')[:50]} (Status: {val.get('status')}, Reason: {val.get('reason')})")

# Check Excel extracted data
with open('data/ahsp2026/excel_extracted/cipta_karya_analyses.json', 'r', encoding='utf-8') as f:
    extracted = json.load(f)

print(f"\nTotal analyses in cipta_karya_analyses.json: {len(extracted)}")
excel_empty = []
for k, v in extracted.items():
    total_c = len(v.get('labor', [])) + len(v.get('materials', [])) + len(v.get('equipment', []))
    if total_c == 0:
        excel_empty.append((k, v))
print(f"Excel extracted with 0 total components: {len(excel_empty)}")
if excel_empty:
    for k, v in excel_empty[:10]:
        print(f"  Empty in Excel extracted: {k} - {v.get('description')}")
