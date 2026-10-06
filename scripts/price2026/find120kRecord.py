with open('src/data/priceDatabase2026/priceMaster.generated.ts', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'"price":120000', text)]
for idx in matches[:5]:
    print(text[max(0, idx-200):min(len(text), idx+200)])
    print('='*50)
