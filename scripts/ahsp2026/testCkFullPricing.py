import json
import re

with open('data/ahsp2026/excel_extracted/upah_bahan.json', 'r', encoding='utf-8') as f:
    ub = json.load(f)

with open('data/ahsp2026/excel_extracted/dhsp_items.json', 'r', encoding='utf-8') as f:
    dhsp = json.load(f)

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)

ck_items = [it for it in master['items'] if it.get('field') == 'CIPTA_KARYA']

def norm_s(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', str(s).lower())).strip()

# Build index of Upah Bahan
ub_dict = {}
for m in ub['materials']:
    ub_dict[(norm_s(m['name']), norm_s(m.get('unit', '')))] = m['price']
    ub_dict[norm_s(m['name'])] = m['price']

for l in ub['labor']:
    ub_dict[(norm_s(l['name']), norm_s(l.get('unit', '')))] = l['price']
    ub_dict[norm_s(l['name'])] = l['price']
    if l.get('code'):
        ub_dict[l['code'].strip()] = l['price']

for e in ub['equipment']:
    ub_dict[(norm_s(e['name']), norm_s(e.get('unit', '')))] = e['price']
    ub_dict[norm_s(e['name'])] = e['price']

resolved_comp_items = 0
dhsp_fallback_items = 0
unpriced_items = 0

for it in ck_items:
    comps = it.get('components', {})
    mats = comps.get('materials', [])
    labs = comps.get('labor', [])
    eqs = comps.get('equipment', [])
    all_c = mats + labs + eqs
    
    comp_resolved = 0
    subtotal = 0.0
    for c in all_c:
        nm = norm_s(c.get('resource_name', ''))
        un = norm_s(c.get('unit', ''))
        cd = c.get('resource_code', '').strip()
        coef = c.get('coefficient', 0.0)
        
        prc = None
        if (nm, un) in ub_dict:
            prc = ub_dict[(nm, un)]
        elif nm in ub_dict:
            prc = ub_dict[nm]
        elif cd and cd in ub_dict:
            prc = ub_dict[cd]
            
        if prc is not None:
            comp_resolved += 1
            subtotal += coef * prc
            
    if all_c and comp_resolved == len(all_c):
        resolved_comp_items += 1
    elif all_c and comp_resolved > 0:
        resolved_comp_items += 1 # Partially resolved
    elif it['code'] in dhsp and dhsp[it['code']]['price'] > 0:
        dhsp_fallback_items += 1
    else:
        unpriced_items += 1

print(f"Total Cipta Karya items: {len(ck_items)}")
print(f"  Items with resolved components: {resolved_comp_items} ({resolved_comp_items/len(ck_items)*100:.1f}%)")
print(f"  Items resolved via DHSP reference: {dhsp_fallback_items} ({dhsp_fallback_items/len(ck_items)*100:.1f}%)")
print(f"  Total items priced: {resolved_comp_items + dhsp_fallback_items} ({(resolved_comp_items + dhsp_fallback_items)/len(ck_items)*100:.1f}%)")
print(f"  Unpriced: {unpriced_items}")
