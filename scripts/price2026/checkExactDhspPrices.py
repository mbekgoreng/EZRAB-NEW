import json
import re

with open('src/data/nationalCostDatabase/officialBinaMargaDhsp2026.ts', 'r', encoding='utf-8') as f:
    text = f.read()

for c in ['2.1.(1)', '2.2.(1)', '3.1.(1)', '5.1.(1a)', '6.1.(1)', '7.1.(1a2)']:
    pat = r'\{\s*\"code\":\s*\"' + re.escape(c) + r'\"[\s\S]*?\"sourceRow\":\s*\d+\s*\}'
    m = re.search(pat, text)
    if m:
        block = m.group(0)
        # extract unitPrice, directCost, overheadAmount
        up = re.search(r'\"unitPrice\":\s*([\d\.]+)', block).group(1)
        dc = re.search(r'\"directCost\":\s*([\d\.]+)', block).group(1)
        oh = re.search(r'\"overheadAmount\":\s*([\d\.]+)', block).group(1)
        print(f'{c:<12} -> UnitPrice (DHSP): {up:<10} | DirectCost: {dc:<12} | Overhead: {oh:<10}')
