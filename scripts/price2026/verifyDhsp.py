import re

with open('src/data/nationalCostDatabase/officialCiptaKaryaDhsp2026.ts', 'r', encoding='utf-8') as f:
    txt = f.read()

for c in ['1.1.1.1', '1.1.1.2', '1.1.1.3', '1.1.1.4', '1.1.1.5']:
    pattern = rf'"code":\s*"{re.escape(c)}"[^}}]+?"unitPrice":\s*([0-9\.]+)'
    m = re.search(pattern, txt)
    if m:
        print(f"{c}: {m.group(1)}")
    else:
        print(f"{c}: NOT FOUND")
