import json
import importlib.util
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('data/ahsp2026/validated/ahsp_2026_master.json', 'r', encoding='utf-8') as f:
    master = json.load(f)
ck_items = {it['code']: it for it in master['items'] if it.get('field') == 'CIPTA_KARYA'}

spec = importlib.util.spec_from_file_location('tbh', 'scripts/ahsp2026/testBackwardHeader.py')
tbh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tbh)

excel_items = {it[1][0]: it for it in tbh.all_found_items}

master_missing = set(ck_items.keys()) - set(excel_items.keys())
print(f"Master codes not in Excel ({len(master_missing)} items):")
for c in sorted(list(master_missing))[:30]:
    desc = ck_items[c].get('description', '')
    print(f"  {c:15s} | {desc[:60]}")

excel_extra = set(excel_items.keys()) - set(ck_items.keys())
print(f"\nExcel codes not in Master ({len(excel_extra)} items):")
for c in sorted(list(excel_extra)):
    sheet = excel_items[c][0]
    desc = excel_items[c][1][1]
    print(f"  {c:15s} | sheet={sheet:20s} | {desc[:60]}")
