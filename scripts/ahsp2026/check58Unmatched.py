import json
import re
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('data/ahsp2026/excel_extracted/cipta_karya_analyses.json', 'r', encoding='utf-8') as f:
    analyses = json.load(f)

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)

ck_items = [it for it in master['items'] if it.get('field') == 'CIPTA_KARYA']
unmatched = [it for it in ck_items if it['code'] not in analyses]

print(f"Total unmatched: {len(unmatched)}")

# Prepare index of analyses by normalized description keywords
def norm_kw(s):
    return set(re.findall(r'[a-zA-Z0-9]+', s.lower()))

analyses_desc = []
for k, v in analyses.items():
    analyses_desc.append((k, v, norm_kw(v.get('description', ''))))

alias_suggestions = {}

for it in unmatched:
    code = it['code']
    desc = it.get('description', '')
    desc_kw = norm_kw(desc)
    
    # Try finding best match in analyses
    best_match = None
    best_score = 0
    for ak, av, akw in analyses_desc:
        if not desc_kw or not akw: continue
        inter = len(desc_kw & akw)
        score = inter / max(len(desc_kw), len(akw))
        if score > best_score:
            best_score = score
            best_match = (ak, av)
            
    if best_match and best_score > 0.4:
        alias_suggestions[code] = (best_match[0], best_score, best_match[1].get('description'))
        print(f"MATCH: {code:15s} -> {best_match[0]:15s} (score {best_score:.2f}) | {desc[:40]} <=> {best_match[1].get('description')[:40]}")
    else:
        print(f"NO_MATCH: {code:15s} | {desc[:60]}")
