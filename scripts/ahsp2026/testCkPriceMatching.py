import json
import re

with open('data/ahsp2026/excel_extracted/upah_bahan.json', 'r', encoding='utf-8') as f:
    ub = json.load(f)

# Normalize price dictionary
ub_mat = {re.sub(r'\s+', ' ', m['name'].lower().strip()): m['price'] for m in ub['materials']}
ub_lab = {re.sub(r'\s+', ' ', l['name'].lower().strip()): l['price'] for l in ub['labor']}
ub_lab_code = {l['code'].strip(): l['price'] for l in ub['labor'] if l.get('code')}
ub_eq = {re.sub(r'\s+', ' ', e['name'].lower().strip()): e['price'] for e in ub['equipment']}

print(f"Loaded Upah Bahan: materials={len(ub_mat)}, labor={len(ub_lab)}, eq={len(ub_eq)}")

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)

ck_items = [it for it in master['items'] if it.get('field') == 'CIPTA_KARYA']

fully_priced = 0
partially_priced = 0
unpriced = 0

for it in ck_items:
    comps = it.get('components', {})
    mats = comps.get('materials', [])
    labs = comps.get('labor', [])
    eqs = comps.get('equipment', [])
    total_c = len(mats) + len(labs) + len(eqs)
    
    if total_c == 0:
        unpriced += 1
        continue
        
    resolved_c = 0
    for m in mats:
        nm = re.sub(r'\s+', ' ', m.get('resource_name', '').lower().strip())
        if nm in ub_mat:
            resolved_c += 1
        else:
            # Try fuzzy or partial
            pass
            
    for l in labs:
        nm = re.sub(r'\s+', ' ', l.get('resource_name', '').lower().strip())
        cd = l.get('resource_code', '').strip()
        if nm in ub_lab or cd in ub_lab_code:
            resolved_c += 1
            
    for e in eqs:
        nm = re.sub(r'\s+', ' ', e.get('resource_name', '').lower().strip())
        if nm in ub_eq:
            resolved_c += 1
            
    if resolved_c == total_c:
        fully_priced += 1
    elif resolved_c > 0:
        partially_priced += 1
    else:
        unpriced += 1

print(f"CK items ({len(ck_items)} total):")
print(f"  Fully priced: {fully_priced} ({fully_priced/len(ck_items)*100:.1f}%)")
print(f"  Partially priced: {partially_priced} ({partially_priced/len(ck_items)*100:.1f}%)")
print(f"  Unpriced: {unpriced} ({unpriced/len(ck_items)*100:.1f}%)")
