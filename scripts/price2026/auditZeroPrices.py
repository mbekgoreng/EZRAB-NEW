import os
import re

directories = [
    'src/components/ahsp',
    'src/data/priceDatabase2026',
    'src/data/nationalCostDatabase',
    'src/engine/pricing',
    'src/components/rab',
]

patterns = [
    (r'unitPrice\s*\|\|\s*0', 'Potential unitPrice || 0 fallback'),
    (r'price\s*\|\|\s*0', 'Potential price || 0 fallback'),
    (r'unitPrice\s*\?\?\s*0', 'Potential unitPrice ?? 0 fallback'),
    (r'price\s*\?\?\s*0', 'Potential price ?? 0 fallback'),
    (r'hspPrice\s*\|\|\s*0', 'Potential hspPrice || 0 fallback'),
    (r'hspPrice\s*\?\?\s*0', 'Potential hspPrice ?? 0 fallback'),
    (r'totalPrice\s*\|\|\s*0', 'Potential totalPrice || 0 fallback'),
    (r'\"Rp\s*0\"', 'Hardcoded string "Rp 0"'),
    (r'\'Rp\s*0\'', "Hardcoded string 'Rp 0'"),
]

findings = []

for d in directories:
    if not os.path.exists(d):
        continue
    for root, dirs, files in os.walk(d):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                p = os.path.join(root, f)
                with open(p, 'r', encoding='utf-8', errors='ignore') as fl:
                    lines = fl.readlines()
                for line_idx, line in enumerate(lines):
                    for pat, desc in patterns:
                        if re.search(pat, line):
                            findings.append({
                                'file': p,
                                'line': line_idx + 1,
                                'content': line.strip(),
                                'desc': desc,
                            })

print(f'Total zero pattern occurrences found: {len(findings)}')
for item in findings:
    # Classification
    c = item['content']
    cls = 'BUG'
    if 'formatCurrency' in c or 'toLocaleString' in c or '—' in c or 'belum tersedia' in c:
        cls = 'UI_FALLBACK'
    elif 'comp.' in c or 'subtotal' in c or 'total' in c:
        cls = 'VALID_ZERO'
    elif 'null' in c:
        cls = 'MISSING_PRICE'
    print(f'[{cls}] {item["file"]}:{item["line"]} -> {item["desc"]}')
    print(f'    Code: {c[:100]}')
