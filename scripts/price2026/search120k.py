import os
import re

for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith(('.ts', '.tsx', '.json', '.js')):
            p = os.path.join(root, f)
            try:
                content = open(p, 'r', encoding='utf-8').read()
                if '120000' in content or '120,000' in content or '120.000' in content:
                    print(f'Found in {p}')
            except Exception as e:
                pass
