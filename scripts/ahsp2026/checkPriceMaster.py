import re

with open('src/data/priceDatabase2026/priceMaster.generated.ts', 'r', encoding='utf-8') as f:
    txt = f.read()

sources = set(re.findall(r'"source":\s*"([^"]+)"', txt))
print("Sources in priceMaster:", sources)
items = re.findall(r'"resourceName":\s*"([^"]+)"', txt)
print(f"Total resource names in priceMaster: {len(items)}")
print("Sample resource names (first 10):", items[:10])

# Kill background task 459 if still running
