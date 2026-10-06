with open('src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('"2.1.(1)"')
if idx != -1:
    print(text[idx-20:idx+2500].encode('ascii', 'replace').decode('ascii'))
else:
    print('Not found')
