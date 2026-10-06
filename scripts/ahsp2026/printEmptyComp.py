import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)

ck = [it for it in master['items'] if it.get('field') == 'CIPTA_KARYA']
empty_comp = [it for it in ck if not it.get('components', {}).get('materials') and not it.get('components', {}).get('labor') and not it.get('components', {}).get('equipment')]

print(f"Empty comp count: {len(empty_comp)}")
for it in empty_comp:
    code = it['code']
    unit = it.get('unit', '')
    desc = it.get('description', '')
    print(f"  {code:15s} | {unit:10s} | {desc[:60]}")
